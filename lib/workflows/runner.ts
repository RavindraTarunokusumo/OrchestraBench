import type {
  Evaluation,
  ExecutionResult,
  ModelCallTrace,
  ModelRole,
  RunInput,
  RunResult,
  WorkflowKind
} from "@/lib/domain/types";
import { scoreExecution } from "@/lib/evaluation/score-execution";
import type { SandboxExecutor } from "@/lib/execution/executor";
import type { ModelProvider, ModelRequest } from "@/lib/providers/types";
import { toCallTrace } from "@/lib/providers/types";
import { extractCode } from "@/lib/workflows/extract-code";
import { buildWorkflowGraph } from "@/lib/workflows/graph";
import type { WorkflowEventHandler } from "@/lib/workflows/events";

const CHEAP_MODEL = "cohere/north-mini-code:free";
const STRONG_MODEL = process.env.OPENROUTER_STRONG_MODEL || "cohere/north-mini-code:free";
const ESCALATION_CONFIDENCE_THRESHOLD = 0.6;
const RESPONSE_PREVIEW_LENGTH = 200;

const FAILED_EXECUTION: ExecutionResult = {
  resolved: false,
  testsPassed: 0,
  testsTotal: 0,
  exitCode: null,
  timedOut: false,
  stdout: "",
  stderr: "",
  durationMs: 0,
  backend: "mock"
};

type RunWorkflowArgs = {
  input: RunInput;
  provider: ModelProvider;
  executor: SandboxExecutor;
  onEvent?: WorkflowEventHandler;
};

type CallState = {
  calls: ModelCallTrace[];
  onEvent?: WorkflowEventHandler;
  stepCounter: number;
};

export async function runWorkflow({
  input,
  provider,
  executor,
  onEvent
}: RunWorkflowArgs): Promise<RunResult> {
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
        prompt: buildRepairPrompt(input, "cheap baseline reviewer")
      });
      finalAnswer = call.response;
    }

    if (input.workflow === "single_strong") {
      const call = await executeCall(state, provider, "strong_reviewer", {
        role: "strong_reviewer",
        model: STRONG_MODEL,
        prompt: buildRepairPrompt(input, "strong baseline reviewer")
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
            prompt: buildRepairPrompt(input, `panel reviewer ${index}`)
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
        prompt: buildRepairPrompt(input, "cheap-first reviewer")
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
          prompt: buildRepairPrompt(input, "escalated strong reviewer")
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
        prompt: buildRepairPrompt(input, "finalizer")
      });
      finalAnswer = finalizer.response;
    }
  } catch (error) {
    return buildFailedRun(input, provider.label, state.calls, startedAt, error);
  }

  const candidateCode = extractCode(finalAnswer);
  const costUsd = sumCost(state.calls);
  const execution = await executor.run({
    language: input.language,
    candidateCode,
    testCode: input.testCode ?? "",
    entryPoint: input.entryPoint,
    timeoutMs: 30_000
  });
  onEvent?.({ type: "execution-result", result: execution });

  const scored = scoreExecution(execution, costUsd);
  const evaluation: Evaluation = {
    ...scored,
    judgeConfidence: state.calls.some((c) => c.role === "judge") ? 0.84 : 0.72
  };
  const latencyMs = state.calls.reduce((total, call) => total + call.latencyMs, 0);
  const completedAt = new Date();

  return {
    id: makeId("run"),
    workflow: input.workflow,
    status: execution.resolved ? "completed" : "partial",
    title: input.title,
    language: input.language,
    prompt: input.prompt,
    code: input.code,
    providerLabel: provider.label,
    finalAnswer,
    candidateCode,
    execution,
    calls: state.calls,
    evaluation,
    costUsd,
    latencyMs,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    escalated,
    escalationReason,
    benchmarkTaskId: input.benchmarkTaskId
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

  if (!input.testCode?.trim()) {
    throw new Error("Test code is required.");
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
    trace.nodeId = nodeId;
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
      error: error instanceof Error ? error.message : "Unknown provider failure.",
      nodeId
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

function buildRepairPrompt(input: RunInput, role: string): string {
  return [
    `Role: ${role}`,
    `Task: ${input.title}`,
    `Language: ${input.language}`,
    `Instructions: ${input.prompt}`,
    "Return only the corrected code in a single code block. Do not include explanations.",
    "Buggy code:",
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
  const evaluation = scoreExecution(FAILED_EXECUTION, costUsd);

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
    candidateCode: "",
    execution: FAILED_EXECUTION,
    calls,
    evaluation,
    costUsd,
    latencyMs: calls.reduce((total, call) => total + call.latencyMs, 0),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    failureNotes,
    benchmarkTaskId: input.benchmarkTaskId
  };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
