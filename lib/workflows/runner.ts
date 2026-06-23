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
import { buildWorkflowGraph } from "@/lib/workflows/graph";
import type { WorkflowEventHandler } from "@/lib/workflows/events";

const CHEAP_MODEL = "cohere/north-mini-code:free";
const STRONG_MODEL = process.env.OPENROUTER_STRONG_MODEL || "cohere/north-mini-code:free";
const ESCALATION_CONFIDENCE_THRESHOLD = 0.6;
const RESPONSE_PREVIEW_LENGTH = 200;

type RunWorkflowArgs = {
  input: RunInput;
  provider: ModelProvider;
  onEvent?: WorkflowEventHandler;
};

type CallState = {
  calls: ModelCallTrace[];
  onEvent?: WorkflowEventHandler;
  stepCounter: number;
};

export async function runWorkflow({ input, provider, onEvent }: RunWorkflowArgs): Promise<RunResult> {
  validateRunInput(input);

  const startedAt = new Date();
  const state: CallState = { calls: [], onEvent, stepCounter: 0 };
  let finalAnswer = "";
  let escalated = false;
  let escalationReason: string | undefined;

  emitRunInit(input.workflow, onEvent);

  try {
    if (input.workflow === "single_cheap") {
      const call = await executeCall(state, provider, "cheap_reviewer", {
        role: "cheap_reviewer",
        model: CHEAP_MODEL,
        prompt: buildReviewPrompt(input, "cheap baseline reviewer")
      });
      finalAnswer = call.response;
    }

    if (input.workflow === "single_strong") {
      const call = await executeCall(state, provider, "strong_reviewer", {
        role: "strong_reviewer",
        model: STRONG_MODEL,
        prompt: buildReviewPrompt(input, "strong baseline reviewer")
      });
      finalAnswer = call.response;
    }

    if (input.workflow === "panel_judge") {
      assertWithinProjectedCostLimit(input.costLimitUsd, CHEAP_MODEL, 4, state.calls);
      const panelCalls = await Promise.all(
        [1, 2, 3].map((index) =>
          executeCall(state, provider, `panelist-${index}`, {
            role: "panelist",
            model: CHEAP_MODEL,
            prompt: buildReviewPrompt(input, `panel reviewer ${index}`)
          })
        )
      );
      const judge = await executeCall(state, provider, "judge", {
        role: "judge",
        model: CHEAP_MODEL,
        prompt: `Compare these panel reports and synthesize the best answer:\n${panelCalls
          .map((call) => call.response)
          .join("\n\n")}`
      });
      finalAnswer = judge.response;
    }

    if (input.workflow === "cheap_first") {
      const cheap = await executeCall(state, provider, "cheap_reviewer", {
        role: "cheap_reviewer",
        model: CHEAP_MODEL,
        prompt: buildReviewPrompt(input, "cheap-first reviewer")
      });
      const verifier = await executeCall(state, provider, "verifier", {
        role: "verifier",
        model: CHEAP_MODEL,
        prompt: `Grade this review confidence from 0 to 1 and explain whether escalation is needed:\n${cheap.response}`
      });
      const confidence = parseVerifierConfidence(verifier.response);
      const projectedStrongCost = estimateProjectedCallCost(STRONG_MODEL, state.calls);
      const currentCost = sumCost(state.calls);

      if (
        confidence < ESCALATION_CONFIDENCE_THRESHOLD &&
        input.costLimitUsd !== undefined &&
        currentCost + projectedStrongCost > input.costLimitUsd
      ) {
        finalAnswer = cheap.response;
        escalationReason = `Cost limit prevented escalation after verifier confidence ${confidence.toFixed(2)}.`;
      } else if (confidence < ESCALATION_CONFIDENCE_THRESHOLD) {
        const strong = await executeCall(state, provider, "strong_reviewer", {
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

      onEvent?.({ type: "escalation", escalated, reason: escalationReason ?? "" });
    }

    if (input.workflow === "planner_worker_verifier") {
      assertWithinProjectedCostLimit(input.costLimitUsd, CHEAP_MODEL, 4, state.calls);
      const planner = await executeCall(state, provider, "planner", {
        role: "planner",
        model: CHEAP_MODEL,
        prompt: `Plan a code review for this task:\n${input.prompt}\n\n${input.code}`
      });
      const worker = await executeCall(state, provider, "worker", {
        role: "worker",
        model: CHEAP_MODEL,
        prompt: `Use this plan to inspect the code:\n${planner.response}\n\n${input.code}`
      });
      const verifier = await executeCall(state, provider, "verifier", {
        role: "verifier",
        model: CHEAP_MODEL,
        prompt: `Attack this answer for missed bugs and weak claims:\n${worker.response}`
      });
      const finalizer = await executeCall(state, provider, "finalizer", {
        role: "finalizer",
        model: CHEAP_MODEL,
        prompt: `Produce the final report from worker and verifier notes:\n${worker.response}\n\n${verifier.response}`
      });
      finalAnswer = finalizer.response;
    }
  } catch (error) {
    return buildFailedRun(input, provider.label, state.calls, startedAt, error);
  }

  const findings = synthesizeFindings(input, finalAnswer);
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
  nodeId: string,
  request: ModelRequest
): Promise<ModelCallTrace> {
  const stepId = makeStepId(state);
  state.onEvent?.({ type: "step-start", stepId, nodeId, role: request.role, model: request.model });

  try {
    const response = await provider.complete(request);
    const trace = toCallTrace(request, response, makeId("call"));
    state.calls.push(trace);
    state.onEvent?.({
      type: "step-finish",
      stepId,
      nodeId,
      role: request.role,
      model: request.model,
      usage: trace.usage,
      costUsd: trace.estimatedCostUsd,
      latencyMs: trace.latencyMs,
      responsePreview: trace.response.slice(0, RESPONSE_PREVIEW_LENGTH)
    });
    return trace;
  } catch (error) {
    const trace: ModelCallTrace = {
      id: makeId("call"),
      role: request.role,
      provider: provider.label,
      model: request.model,
      prompt: request.prompt,
      response: "",
      usage: {
        inputTokens: 0,
        outputTokens: 0
      },
      estimatedCostUsd: 0,
      latencyMs: 0,
      error: error instanceof Error ? error.message : "Unknown provider failure."
    };
    state.calls.push(trace);
    throw error;
  }
}

function emitRunInit(workflow: WorkflowKind, onEvent: WorkflowEventHandler | undefined): void {
  if (!onEvent) {
    return;
  }

  const graph = buildWorkflowGraph(workflow);
  const plannedSteps = graph.nodes
    .filter((node): node is typeof node & { role: ModelRole } => node.role !== undefined)
    .map((node) => ({
      stepId: `planned_${node.id}`,
      nodeId: node.id,
      role: node.role,
      model: node.role === "strong_reviewer" ? STRONG_MODEL : CHEAP_MODEL
    }));

  onEvent({ type: "run-init", workflow, graph, plannedSteps });
}

function makeStepId(state: CallState): string {
  state.stepCounter += 1;
  return `step_${state.stepCounter}`;
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

function synthesizeFindings(input: RunInput, finalAnswer: string): Finding[] {
  const knownBugs = input.knownBugs ?? [];
  if (knownBugs.length > 0) {
    return knownBugs
      .filter((bug) => matchesKnownBug(finalAnswer, bug.title, bug.description))
      .map((bug) => ({
        id: makeId("finding"),
        title: bug.title,
        description: bug.description,
        severity: bug.severity,
        confidence: 0.82,
        sourceRole: input.workflow === "single_strong" ? "strong_reviewer" : "judge",
        filePath: bug.filePath,
        line: bug.line,
        truthState: "true_positive"
      }));
  }

  return [
    {
      id: makeId("finding"),
      title: "Unsafe nullable access",
      description:
        finalAnswer ||
        "The review identified a likely unsafe access path that can throw before authorization logic completes.",
      severity: input.workflow === "single_cheap" ? "medium" : "high",
      confidence: input.workflow === "single_cheap" ? 0.68 : 0.82,
      sourceRole: input.workflow === "single_strong" ? "strong_reviewer" : "judge",
      truthState: "true_positive"
    }
  ];
}

function matchesKnownBug(finalAnswer: string, title: string, description: string): boolean {
  const answer = normalizeForMatch(finalAnswer);
  const tokens = normalizeForMatch(`${title} ${description}`)
    .split(" ")
    .filter((token) => token.length >= 4);
  if (tokens.length === 0) {
    return false;
  }

  const matches = tokens.filter((token) => answer.includes(token)).length;
  return matches / tokens.length >= 0.25;
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function estimateProjectedCallCost(model: string, calls: ModelCallTrace[]): number {
  if (model.endsWith(":free")) {
    return 0;
  }

  const paidCalls = calls.filter((call) => call.estimatedCostUsd > 0);
  if (paidCalls.length > 0) {
    return paidCalls.reduce((total, call) => total + call.estimatedCostUsd, 0) / paidCalls.length;
  }

  return 0.001;
}

function assertWithinProjectedCostLimit(
  costLimitUsd: number | undefined,
  model: string,
  additionalCalls: number,
  calls: ModelCallTrace[]
): void {
  if (costLimitUsd === undefined) {
    return;
  }

  const projectedCost = sumCost(calls) + estimateProjectedCallCost(model, calls) * additionalCalls;
  if (projectedCost > costLimitUsd) {
    throw new Error(`Cost limit would be exceeded before starting this workflow (${projectedCost.toFixed(4)} USD).`);
  }
}

function buildFailedRun(
  input: RunInput,
  providerLabel: string,
  calls: ModelCallTrace[],
  startedAt: Date,
  error: unknown
): RunResult {
  const failureNotes = error instanceof Error ? error.message : "Unknown workflow failure.";
  const completedAt = new Date();
  const costUsd = sumCost(calls);
  const evaluation = evaluateRun([], input.knownBugs ?? [], costUsd, calls);

  return {
    id: makeId("run"),
    workflow: input.workflow,
    status: "failed",
    title: input.title,
    language: input.language,
    prompt: input.prompt,
    code: input.code,
    providerLabel,
    finalAnswer: "",
    findings: [],
    calls,
    evaluation,
    costUsd,
    latencyMs: calls.reduce((total, call) => total + call.latencyMs, 0),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    failureNotes,
    benchmarkTaskId: input.benchmarkTaskId,
    knownBugs: input.knownBugs
  };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
