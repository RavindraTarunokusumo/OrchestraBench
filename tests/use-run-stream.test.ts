import { describe, expect, it } from "vitest";
import {
  initialRunStreamState,
  markStalledActiveNodesFailed,
  parseSseChunk,
  reduceStreamEvent
} from "@/components/orchestration/use-run-stream";
import type { WorkflowGraph } from "@/lib/workflows/graph";
import type { WorkflowEvent } from "@/lib/workflows/events";

const graph: WorkflowGraph = {
  nodes: [
    { id: "input", kind: "input", label: "Input", column: 0, row: 0 },
    { id: "router", kind: "router", label: "Router", column: 1, row: 0 },
    { id: "cheap_reviewer", kind: "agent", label: "Cheap reviewer", role: "cheap_reviewer", column: 2, row: 0 },
    { id: "result", kind: "result", label: "Result", column: 3, row: 0 }
  ],
  edges: [
    { from: "input", to: "router" },
    { from: "router", to: "cheap_reviewer" },
    { from: "cheap_reviewer", to: "result" }
  ]
};

const runInitEvent: WorkflowEvent = {
  type: "run-init",
  workflow: "single_cheap",
  graph,
  plannedSteps: [{ stepId: "planned_1", nodeId: "cheap_reviewer", role: "cheap_reviewer", model: "gpt-cheap" }]
};

describe("parseSseChunk", () => {
  it("splits multiple complete events and strips the data: prefix", () => {
    const event1 = JSON.stringify({ type: "step-start", stepId: "step_1", nodeId: "a", role: "cheap_reviewer", model: "m" });
    const event2 = JSON.stringify({ type: "escalation", escalated: false, reason: "ok" });
    const buffer = `data: ${event1}\n\ndata: ${event2}\n\n`;

    const { events, rest } = parseSseChunk(buffer);

    expect(events).toEqual([JSON.parse(event1), JSON.parse(event2)]);
    expect(rest).toBe("");
  });

  it("returns a partial trailing event as rest without parsing it", () => {
    const event1 = JSON.stringify({ type: "escalation", escalated: true, reason: "low confidence" });
    const partial = `data: ${JSON.stringify({ type: "step-start", stepId: "step_2" }).slice(0, 10)}`;
    const buffer = `data: ${event1}\n\n${partial}`;

    const { events, rest } = parseSseChunk(buffer);

    expect(events).toEqual([JSON.parse(event1)]);
    expect(rest).toBe(partial);
  });

  it("ignores empty trailing segments", () => {
    const { events, rest } = parseSseChunk("");
    expect(events).toEqual([]);
    expect(rest).toBe("");
  });
});

describe("reduceStreamEvent", () => {
  it("run-init initializes all nodes (input/router done, others pending), sets graph and stepsTotal", () => {
    const next = reduceStreamEvent(initialRunStreamState, runInitEvent);

    expect(next.status).toBe("running");
    expect(next.graph).toBe(graph);
    expect(next.totals.stepsTotal).toBe(1);
    expect(next.nodeStates.input.status).toBe("done");
    expect(next.nodeStates.router.status).toBe("done");
    expect(next.nodeStates.cheap_reviewer.status).toBe("pending");
    expect(next.nodeStates.result.status).toBe("pending");
  });

  it("step-start sets the matching nodeId active by nodeId, not stepId", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);
    const stepStart: WorkflowEvent = {
      type: "step-start",
      stepId: "step_999",
      nodeId: "cheap_reviewer",
      role: "cheap_reviewer",
      model: "gpt-cheap"
    };

    const next = reduceStreamEvent(afterInit, stepStart);

    expect(next.nodeStates.cheap_reviewer.status).toBe("active");
    expect(next.nodeStates.cheap_reviewer.model).toBe("gpt-cheap");
  });

  it("step-finish sets the node done and accumulates totals using nodeId mapping", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);
    const afterStart = reduceStreamEvent(afterInit, {
      type: "step-start",
      stepId: "step_999",
      nodeId: "cheap_reviewer",
      role: "cheap_reviewer",
      model: "gpt-cheap"
    });
    const stepFinish: WorkflowEvent = {
      type: "step-finish",
      stepId: "step_999",
      nodeId: "cheap_reviewer",
      role: "cheap_reviewer",
      model: "gpt-cheap",
      usage: { inputTokens: 100, outputTokens: 50 },
      costUsd: 0.002,
      latencyMs: 1200,
      responsePreview: "Looks fine."
    };

    const next = reduceStreamEvent(afterStart, stepFinish);

    expect(next.nodeStates.cheap_reviewer.status).toBe("done");
    expect(next.nodeStates.cheap_reviewer.responsePreview).toBe("Looks fine.");
    expect(next.totals.costUsd).toBeCloseTo(0.002);
    expect(next.totals.latencyMs).toBe(1200);
    expect(next.totals.inputTokens).toBe(100);
    expect(next.totals.outputTokens).toBe(50);
    expect(next.totals.stepsDone).toBe(1);
  });

  it("uses different stepId and nodeId spaces correctly (planned_* vs step_*)", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);
    expect(afterInit.totals.stepsTotal).toBe(1);

    // live stepId differs entirely from plannedSteps[].stepId ("planned_1")
    const next = reduceStreamEvent(afterInit, {
      type: "step-start",
      stepId: "step_live_abc",
      nodeId: "cheap_reviewer",
      role: "cheap_reviewer",
      model: "gpt-cheap"
    });

    expect(next.nodeStates.cheap_reviewer.status).toBe("active");
  });

  it("escalation sets the escalation field", () => {
    const next = reduceStreamEvent(initialRunStreamState, {
      type: "escalation",
      escalated: true,
      reason: "verifier confidence below threshold"
    });

    expect(next.escalation).toEqual({ escalated: true, reason: "verifier confidence below threshold" });
  });

  it("execution-result stores the execution result in state", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);
    const executionResult = {
      resolved: true,
      testsPassed: 2,
      testsTotal: 2,
      exitCode: 0,
      timedOut: false,
      stdout: "2 passed",
      stderr: "",
      durationMs: 120,
      backend: "mock" as const
    };

    const next = reduceStreamEvent(afterInit, { type: "execution-result", result: executionResult });

    expect(next.executionResult).toEqual(executionResult);
  });

  it("run-final marks status complete, sets finalRunId, and marks the result node done", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);
    const afterExecution = reduceStreamEvent(afterInit, {
      type: "execution-result",
      result: {
        resolved: true,
        testsPassed: 2,
        testsTotal: 2,
        exitCode: 0,
        timedOut: false,
        stdout: "ok",
        stderr: "",
        durationMs: 50,
        backend: "mock"
      }
    });

    const next = reduceStreamEvent(afterExecution, {
      type: "run-final",
      runId: "run_abc123",
      status: "completed",
      costUsd: 0.01,
      latencyMs: 2000,
      executionMs: 150,
      resolved: true,
      testsPassed: 2,
      testsTotal: 2,
      valueScore: 0.7
    });

    expect(next.status).toBe("complete");
    expect(next.finalRunId).toBe("run_abc123");
    expect(next.nodeStates.result.status).toBe("done");
    expect(next.totals.costUsd).toBe(0.01);
    expect(next.totals.latencyMs).toBe(2000);
    expect(next.executionResult?.resolved).toBe(true);
    expect(next.finalSummary).toEqual({
      status: "completed",
      costUsd: 0.01,
      latencyMs: 2000,
      executionMs: 150,
      resolved: true,
      testsPassed: 2,
      testsTotal: 2,
      valueScore: 0.7
    });
  });

  it("run-final with status failed marks status failed but still sets finalRunId (run was persisted)", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);

    const next = reduceStreamEvent(afterInit, {
      type: "run-final",
      runId: "run_failed_1",
      status: "failed",
      costUsd: 0.001,
      latencyMs: 500,
      executionMs: 0,
      resolved: false,
      testsPassed: 0,
      testsTotal: 1,
      valueScore: 0
    });

    expect(next.status).toBe("failed");
    expect(next.finalRunId).toBe("run_failed_1");
    expect(next.nodeStates.result.status).toBe("failed");
    expect(next.finalSummary?.status).toBe("failed");
    expect(next.finalSummary?.resolved).toBe(false);
  });

  it("run-error sets status error and the message, with no runId", () => {
    const next = reduceStreamEvent(initialRunStreamState, {
      type: "run-error",
      message: "Provider unavailable."
    });

    expect(next.status).toBe("error");
    expect(next.error).toBe("Provider unavailable.");
    expect(next.finalRunId).toBeNull();
  });
});

describe("markStalledActiveNodesFailed", () => {
  it("flips any still-active node to failed when the stream ends without a terminal event", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);
    const afterStart = reduceStreamEvent(afterInit, {
      type: "step-start",
      stepId: "step_1",
      nodeId: "cheap_reviewer",
      role: "cheap_reviewer",
      model: "gpt-cheap"
    });

    const next = markStalledActiveNodesFailed(afterStart);

    expect(next.nodeStates.cheap_reviewer.status).toBe("failed");
    expect(next.status).toBe("failed");
  });

  it("is a no-op when there are no active nodes", () => {
    const afterInit = reduceStreamEvent(initialRunStreamState, runInitEvent);
    const next = markStalledActiveNodesFailed(afterInit);
    expect(next).toBe(afterInit);
  });
});
