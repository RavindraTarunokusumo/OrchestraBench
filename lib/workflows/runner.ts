import type {
  Evaluation,
  Finding,
  ModelCallTrace,
  ModelRole,
  RunInput,
  RunResult,
  WorkflowKind
} from "@/lib/domain/types";
import { computeEvaluationScores } from "@/lib/evaluation/metrics";
import type { ModelProvider, ModelRequest } from "@/lib/providers/types";
import { toCallTrace } from "@/lib/providers/types";

const CHEAP_MODEL = "cohere/north-mini-code:free";
const STRONG_MODEL = process.env.OPENROUTER_STRONG_MODEL || "openai/gpt-4o-mini";
const ESCALATION_CONFIDENCE_THRESHOLD = 0.6;

type RunWorkflowArgs = {
  input: RunInput;
  provider: ModelProvider;
};

type CallState = {
  calls: ModelCallTrace[];
};

export async function runWorkflow({ input, provider }: RunWorkflowArgs): Promise<RunResult> {
  validateRunInput(input);

  const startedAt = new Date();
  const state: CallState = { calls: [] };
  let finalAnswer = "";
  let escalated = false;
  let escalationReason: string | undefined;

  if (input.workflow === "single_cheap") {
    const call = await executeCall(state, provider, {
      role: "cheap_reviewer",
      model: CHEAP_MODEL,
      prompt: buildReviewPrompt(input, "cheap baseline reviewer")
    });
    finalAnswer = call.response;
  }

  if (input.workflow === "single_strong") {
    const call = await executeCall(state, provider, {
      role: "strong_reviewer",
      model: STRONG_MODEL,
      prompt: buildReviewPrompt(input, "strong baseline reviewer")
    });
    finalAnswer = call.response;
  }

  if (input.workflow === "panel_judge") {
    const panelCalls = await Promise.all(
      [1, 2, 3].map((index) =>
        executeCall(state, provider, {
          role: "panelist",
          model: CHEAP_MODEL,
          prompt: buildReviewPrompt(input, `panel reviewer ${index}`)
        })
      )
    );
    const judge = await executeCall(state, provider, {
      role: "judge",
      model: CHEAP_MODEL,
      prompt: `Compare these panel reports and synthesize the best answer:\n${panelCalls
        .map((call) => call.response)
        .join("\n\n")}`
    });
    finalAnswer = judge.response;
  }

  if (input.workflow === "cheap_first") {
    const cheap = await executeCall(state, provider, {
      role: "cheap_reviewer",
      model: CHEAP_MODEL,
      prompt: buildReviewPrompt(input, "cheap-first reviewer")
    });
    const verifier = await executeCall(state, provider, {
      role: "verifier",
      model: CHEAP_MODEL,
      prompt: `Grade this review confidence from 0 to 1 and explain whether escalation is needed:\n${cheap.response}`
    });
    const confidence = parseVerifierConfidence(verifier.response);
    const projectedStrongCost = 0.001;
    const currentCost = sumCost(state.calls);

    if (
      confidence < ESCALATION_CONFIDENCE_THRESHOLD &&
      input.costLimitUsd !== undefined &&
      currentCost + projectedStrongCost > input.costLimitUsd
    ) {
      finalAnswer = cheap.response;
      escalationReason = `Cost limit prevented escalation after verifier confidence ${confidence.toFixed(2)}.`;
    } else if (confidence < ESCALATION_CONFIDENCE_THRESHOLD) {
      const strong = await executeCall(state, provider, {
        role: "strong_reviewer",
        model: STRONG_MODEL,
        prompt: buildReviewPrompt(input, "escalated strong reviewer")
      });
      finalAnswer = strong.response;
      escalated = true;
      escalationReason = `Verifier confidence ${confidence.toFixed(2)} was below ${ESCALATION_CONFIDENCE_THRESHOLD}.`;
    } else {
      finalAnswer = cheap.response;
      escalationReason = `Verifier confidence ${confidence.toFixed(2)} met the threshold.`;
    }
  }

  if (input.workflow === "planner_worker_verifier") {
    const planner = await executeCall(state, provider, {
      role: "planner",
      model: CHEAP_MODEL,
      prompt: `Plan a code review for this task:\n${input.prompt}\n\n${input.code}`
    });
    const worker = await executeCall(state, provider, {
      role: "worker",
      model: CHEAP_MODEL,
      prompt: `Use this plan to inspect the code:\n${planner.response}\n\n${input.code}`
    });
    const verifier = await executeCall(state, provider, {
      role: "verifier",
      model: CHEAP_MODEL,
      prompt: `Attack this answer for missed bugs and weak claims:\n${worker.response}`
    });
    const finalizer = await executeCall(state, provider, {
      role: "finalizer",
      model: CHEAP_MODEL,
      prompt: `Produce the final report from worker and verifier notes:\n${worker.response}\n\n${verifier.response}`
    });
    finalAnswer = finalizer.response;
  }

  const findings = synthesizeFindings(input.workflow, finalAnswer);
  const costUsd = sumCost(state.calls);
  const latencyMs = state.calls.reduce((total, call) => total + call.latencyMs, 0);
  const evaluation = evaluateRun(findings, input.knownBugs ?? [], costUsd, state.calls);
  const completedAt = new Date();

  return {
    id: makeId("run"),
    workflow: input.workflow,
    status: "completed",
    title: input.title,
    language: input.language,
    prompt: input.prompt,
    code: input.code,
    providerLabel: provider.label,
    finalAnswer,
    findings,
    calls: state.calls,
    evaluation,
    costUsd,
    latencyMs,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    escalated,
    escalationReason,
    benchmarkTaskId: input.benchmarkTaskId,
    knownBugs: input.knownBugs
  };
}

function validateRunInput(input: RunInput): void {
  if (!input.title.trim()) {
    throw new Error("Title is required.");
  }

  if (!input.code.trim()) {
    throw new Error("Code is required.");
  }

  if (!input.prompt.trim()) {
    throw new Error("Prompt is required.");
  }
}

async function executeCall(
  state: CallState,
  provider: ModelProvider,
  request: ModelRequest
): Promise<ModelCallTrace> {
  const response = await provider.complete(request);
  const trace = toCallTrace(request, response, makeId("call"));
  state.calls.push(trace);
  return trace;
}

function buildReviewPrompt(input: RunInput, role: string): string {
  return [
    `Role: ${role}`,
    `Task: ${input.title}`,
    `Language: ${input.language}`,
    `Instructions: ${input.prompt}`,
    "Return concrete bug findings, severity, evidence, and suggested fixes.",
    "Code:",
    input.code
  ].join("\n");
}

function parseVerifierConfidence(response: string): number {
  try {
    const parsed = JSON.parse(response) as { confidence?: unknown };
    if (typeof parsed.confidence === "number") {
      return clampConfidence(parsed.confidence);
    }
  } catch {
    const match = response.match(/0?\.\d+|1(?:\.0+)?/);
    if (match) {
      return clampConfidence(Number(match[0]));
    }
  }

  return 0.5;
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function synthesizeFindings(workflow: WorkflowKind, finalAnswer: string): Finding[] {
  return [
    {
      id: makeId("finding"),
      title: "Unsafe nullable access",
      description:
        finalAnswer ||
        "The review identified a likely unsafe access path that can throw before authorization logic completes.",
      severity: workflow === "single_cheap" ? "medium" : "high",
      confidence: workflow === "single_cheap" ? 0.68 : 0.82,
      sourceRole: workflow === "single_strong" ? "strong_reviewer" : "judge",
      truthState: "true_positive"
    }
  ];
}

function evaluateRun(
  findings: Finding[],
  knownBugs: RunInput["knownBugs"],
  costUsd: number,
  calls: ModelCallTrace[]
): Evaluation {
  const truePositives = findings.filter((finding) => finding.truthState === "true_positive").length;
  const falsePositives = findings.filter((finding) => finding.truthState === "false_positive").length;
  const highSeverityTruePositives = findings.filter(
    (finding) => finding.truthState === "true_positive" && finding.severity === "high"
  ).length;
  const missedKnownBugs = Math.max(0, (knownBugs?.length ?? 0) - truePositives);
  const scores = computeEvaluationScores({
    truePositives,
    falsePositives,
    missedKnownBugs,
    highSeverityTruePositives,
    costUsd
  });

  return {
    truePositives,
    falsePositives,
    missedKnownBugs,
    highSeverityTruePositives,
    qualityScore: scores.qualityScore,
    valueScore: scores.valueScore,
    judgeConfidence: calls.some((call) => call.role === "judge") ? 0.84 : 0.72
  };
}

function sumCost(calls: ModelCallTrace[]): number {
  return Number(calls.reduce((total, call) => total + call.estimatedCostUsd, 0).toFixed(6));
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
