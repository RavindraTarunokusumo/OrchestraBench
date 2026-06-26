import { describe, expect, it } from "vitest";
import { deriveNodeStatesFromCalls } from "@/components/orchestration/derive-node-states";
import { buildWorkflowGraph } from "@/lib/workflows/graph";
import type { ModelCallTrace, ModelRole, RunResult } from "@/lib/domain/types";

function makeCall(role: ModelRole, overrides: Partial<ModelCallTrace> = {}): ModelCallTrace {
  return {
    id: `call_${role}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    provider: "mock",
    model: "cohere/north-mini-code:free",
    prompt: "prompt",
    response: "response text".repeat(20),
    usage: { inputTokens: 10, outputTokens: 20 },
    estimatedCostUsd: 0.0001,
    latencyMs: 50,
    ...overrides
  };
}

function makeRun(overrides: Partial<RunResult>): RunResult {
  return {
    id: "run_1",
    workflow: "single_cheap",
    status: "completed",
    title: "Test run",
    language: "TypeScript",
    prompt: "Fix the bug.",
    code: "export const ok = true;",
    providerLabel: "Mock provider",
    finalAnswer: "answer",
    candidateCode: "export const ok = true;",
    execution: {
      resolved: true,
      testsPassed: 1,
      testsTotal: 1,
      exitCode: 0,
      timedOut: false,
      stdout: "1 passed",
      stderr: "",
      durationMs: 10,
      backend: "mock"
    },
    calls: [],
    evaluation: {
      resolved: true,
      testsPassed: 1,
      testsTotal: 1,
      valueScore: 1,
      judgeConfidence: 0.8
    },
    costUsd: 0,
    latencyMs: 0,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides
  };
}

describe("deriveNodeStatesFromCalls", () => {
  it("maps three panelist calls to panelist-1/2/3 in order, then the judge", () => {
    const graph = buildWorkflowGraph("panel_judge");
    const run = makeRun({
      workflow: "panel_judge",
      calls: [
        makeCall("panelist", { id: "call_p1", model: "model-a" }),
        makeCall("panelist", { id: "call_p2", model: "model-b" }),
        makeCall("panelist", { id: "call_p3", model: "model-c" }),
        makeCall("judge", { id: "call_judge" })
      ]
    });

    const nodeStates = deriveNodeStatesFromCalls(graph, run);

    expect(nodeStates["panelist-1"]).toMatchObject({ status: "done", model: "model-a" });
    expect(nodeStates["panelist-2"]).toMatchObject({ status: "done", model: "model-b" });
    expect(nodeStates["panelist-3"]).toMatchObject({ status: "done", model: "model-c" });
    expect(nodeStates.judge).toMatchObject({ status: "done" });
    expect(nodeStates.input).toMatchObject({ status: "done" });
    expect(nodeStates.router).toMatchObject({ status: "done" });
    expect(nodeStates.result).toMatchObject({ status: "done" });
  });

  it("maps panelist calls by nodeId even when the array order is completion order, not launch order", () => {
    const graph = buildWorkflowGraph("panel_judge");
    const run = makeRun({
      workflow: "panel_judge",
      // Array order is completion order under Promise.all: panelist-2 finished first,
      // but each call carries the nodeId it was launched with, which must win.
      calls: [
        makeCall("panelist", { id: "call_p2", model: "model-b", nodeId: "panelist-2" }),
        makeCall("panelist", { id: "call_p1", model: "model-a", nodeId: "panelist-1" }),
        makeCall("panelist", { id: "call_p3", model: "model-c", nodeId: "panelist-3" }),
        makeCall("judge", { id: "call_judge", nodeId: "judge" })
      ]
    });

    const nodeStates = deriveNodeStatesFromCalls(graph, run);

    expect(nodeStates["panelist-1"]).toMatchObject({ status: "done", model: "model-a" });
    expect(nodeStates["panelist-2"]).toMatchObject({ status: "done", model: "model-b" });
    expect(nodeStates["panelist-3"]).toMatchObject({ status: "done", model: "model-c" });
    expect(nodeStates.judge).toMatchObject({ status: "done" });
  });

  it("leaves strong_reviewer pending for cheap_first when no escalation happened", () => {
    const graph = buildWorkflowGraph("cheap_first");
    const run = makeRun({
      workflow: "cheap_first",
      escalated: false,
      calls: [makeCall("cheap_reviewer"), makeCall("verifier")]
    });

    const nodeStates = deriveNodeStatesFromCalls(graph, run);

    expect(nodeStates.cheap_reviewer).toMatchObject({ status: "done" });
    expect(nodeStates.verifier).toMatchObject({ status: "done" });
    expect(nodeStates.strong_reviewer).toBeUndefined();
  });

  it("marks strong_reviewer done for cheap_first when escalation happened", () => {
    const graph = buildWorkflowGraph("cheap_first");
    const run = makeRun({
      workflow: "cheap_first",
      escalated: true,
      escalationReason: "low confidence",
      calls: [makeCall("cheap_reviewer"), makeCall("verifier"), makeCall("strong_reviewer", { model: "strong-model" })]
    });

    const nodeStates = deriveNodeStatesFromCalls(graph, run);

    expect(nodeStates.strong_reviewer).toMatchObject({ status: "done", model: "strong-model" });
  });

  it("marks a node failed when its matching call has an error", () => {
    const graph = buildWorkflowGraph("single_cheap");
    const run = makeRun({
      workflow: "single_cheap",
      status: "failed",
      calls: [makeCall("cheap_reviewer", { error: "provider unavailable", response: "" })]
    });

    const nodeStates = deriveNodeStatesFromCalls(graph, run);

    expect(nodeStates.cheap_reviewer).toMatchObject({ status: "failed" });
    expect(nodeStates.result).toMatchObject({ status: "failed" });
  });

  it("maps the full planner_worker_verifier sequence", () => {
    const graph = buildWorkflowGraph("planner_worker_verifier");
    const run = makeRun({
      workflow: "planner_worker_verifier",
      calls: [
        makeCall("planner"),
        makeCall("worker"),
        makeCall("verifier"),
        makeCall("finalizer", { response: "final report text" })
      ]
    });

    const nodeStates = deriveNodeStatesFromCalls(graph, run);

    expect(nodeStates.planner).toMatchObject({ status: "done" });
    expect(nodeStates.worker).toMatchObject({ status: "done" });
    expect(nodeStates.verifier).toMatchObject({ status: "done" });
    expect(nodeStates.finalizer).toMatchObject({ status: "done" });
    expect(nodeStates.finalizer?.responsePreview).toBe("final report text");
    expect(nodeStates.result).toMatchObject({ status: "done" });
  });
});
