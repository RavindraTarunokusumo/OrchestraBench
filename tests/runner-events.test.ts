import { describe, expect, it } from "vitest";
import { runWorkflow } from "@/lib/workflows/runner";
import { createMockProvider } from "@/lib/providers/mock-provider";
import type { WorkflowKind } from "@/lib/domain/types";
import type { WorkflowEvent } from "@/lib/workflows/events";

const baseInput = {
  title: "Review auth helper",
  language: "TypeScript",
  prompt: "Find bugs in this code.",
  code: "function isAllowed(user?: { role: string }) { return user!.role === 'admin' }",
  costLimitUsd: 0.02
};

function collectEvents() {
  const events: WorkflowEvent[] = [];
  return { events, onEvent: (event: WorkflowEvent) => events.push(event) };
}

describe("runWorkflow events", () => {
  it.each<WorkflowKind>([
    "single_cheap",
    "single_strong",
    "panel_judge",
    "cheap_first",
    "planner_worker_verifier"
  ])("emits run-init first and step-start before step-finish for each step (%s)", async (workflow) => {
    const { events, onEvent } = collectEvents();

    const result = await runWorkflow({
      input: { ...baseInput, workflow },
      provider: createMockProvider(),
      onEvent
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("run-init");

    const runInit = events[0] as Extract<WorkflowEvent, { type: "run-init" }>;
    expect(runInit.workflow).toBe(workflow);
    const graphNodeIds = new Set(runInit.graph.nodes.map((node) => node.id));

    const startIndices = new Map<string, number>();
    events.forEach((event, index) => {
      if (event.type === "step-start") {
        startIndices.set(event.stepId, index);
        expect(graphNodeIds.has(event.nodeId)).toBe(true);
      }
      if (event.type === "step-finish") {
        const startIndex = startIndices.get(event.stepId);
        expect(startIndex).toBeDefined();
        expect(startIndex).toBeLessThan(index);
        expect(graphNodeIds.has(event.nodeId)).toBe(true);
      }
    });

    const stepFinishEvents = events.filter(
      (event): event is Extract<WorkflowEvent, { type: "step-finish" }> => event.type === "step-finish"
    );
    expect(stepFinishEvents.length).toBe(result.calls.length);

    // every planned step nodeId must exist in the graph
    runInit.plannedSteps.forEach((step) => {
      expect(graphNodeIds.has(step.nodeId)).toBe(true);
    });

    // stepIds are unique
    const stepIds = stepFinishEvents.map((event) => event.stepId);
    expect(new Set(stepIds).size).toBe(stepIds.length);

    // summed totals from step-finish equal RunResult totals
    const summedCost = Number(
      stepFinishEvents.reduce((total, event) => total + event.costUsd, 0).toFixed(6)
    );
    const summedLatency = stepFinishEvents.reduce((total, event) => total + event.latencyMs, 0);
    expect(summedCost).toBe(result.costUsd);
    expect(summedLatency).toBe(result.latencyMs);

    // responsePreview is at most ~200 chars
    stepFinishEvents.forEach((event) => {
      expect(event.responsePreview.length).toBeLessThanOrEqual(200);
    });
  });

  it("emits escalation event for cheap_first reflecting the escalated outcome", async () => {
    const { events, onEvent } = collectEvents();

    const result = await runWorkflow({
      input: { ...baseInput, workflow: "cheap_first" },
      provider: createMockProvider({ verifierConfidence: 0.35 }),
      onEvent
    });

    const escalationEvent = events.find(
      (event): event is Extract<WorkflowEvent, { type: "escalation" }> => event.type === "escalation"
    );
    expect(escalationEvent).toBeDefined();
    expect(escalationEvent?.escalated).toBe(true);
    expect(escalationEvent?.reason).toBe(result.escalationReason);
  });

  it("emits a non-escalated escalation event when verifier confidence is high", async () => {
    const { events, onEvent } = collectEvents();

    const result = await runWorkflow({
      input: { ...baseInput, workflow: "cheap_first" },
      provider: createMockProvider({ verifierConfidence: 0.9 }),
      onEvent
    });

    const escalationEvent = events.find(
      (event): event is Extract<WorkflowEvent, { type: "escalation" }> => event.type === "escalation"
    );
    expect(escalationEvent).toBeDefined();
    expect(escalationEvent?.escalated).toBe(false);
    expect(escalationEvent?.reason).toBe(result.escalationReason);
  });

  it("does not emit an escalation event for non cheap_first workflows", async () => {
    const { events, onEvent } = collectEvents();

    await runWorkflow({
      input: { ...baseInput, workflow: "single_cheap" },
      provider: createMockProvider(),
      onEvent
    });

    expect(events.some((event) => event.type === "escalation")).toBe(false);
  });

  it("never emits run-final (the API route owns that)", async () => {
    const { events, onEvent } = collectEvents();

    await runWorkflow({
      input: { ...baseInput, workflow: "planner_worker_verifier" },
      provider: createMockProvider(),
      onEvent
    });

    expect(events.some((event) => event.type === "run-final")).toBe(false);
  });

  it("maps panel_judge steps to panelist-1/2/3 and judge node ids", async () => {
    const { events, onEvent } = collectEvents();

    await runWorkflow({
      input: { ...baseInput, workflow: "panel_judge" },
      provider: createMockProvider(),
      onEvent
    });

    const stepFinishEvents = events.filter(
      (event): event is Extract<WorkflowEvent, { type: "step-finish" }> => event.type === "step-finish"
    );
    const nodeIds = stepFinishEvents.map((event) => event.nodeId);
    expect(nodeIds).toEqual(["panelist-1", "panelist-2", "panelist-3", "judge"]);
  });

  it("returns an equivalent RunResult whether or not onEvent is provided", async () => {
    const provider = createMockProvider();
    const withoutEvents = await runWorkflow({
      input: { ...baseInput, workflow: "single_cheap" },
      provider
    });
    const { onEvent } = collectEvents();
    const withEvents = await runWorkflow({
      input: { ...baseInput, workflow: "single_cheap" },
      provider,
      onEvent
    });

    expect(withEvents.status).toBe(withoutEvents.status);
    expect(withEvents.workflow).toBe(withoutEvents.workflow);
    expect(withEvents.costUsd).toBe(withoutEvents.costUsd);
    expect(withEvents.latencyMs).toBe(withoutEvents.latencyMs);
    expect(withEvents.findings.map((finding) => ({ ...finding, id: undefined }))).toEqual(
      withoutEvents.findings.map((finding) => ({ ...finding, id: undefined }))
    );
    expect(withEvents.evaluation).toEqual(withoutEvents.evaluation);
    expect(withEvents.calls.map((call) => ({ ...call, id: undefined }))).toEqual(
      withoutEvents.calls.map((call) => ({ ...call, id: undefined }))
    );
  });

  it("still emits step-start/step-finish for the first call before a provider failure, with no run-final", async () => {
    const { events, onEvent } = collectEvents();
    const failingProvider = {
      label: "Failing provider",
      async complete() {
        throw new Error("provider unavailable");
      }
    };

    const result = await runWorkflow({
      input: { ...baseInput, workflow: "single_cheap" },
      provider: failingProvider,
      onEvent
    });

    expect(result.status).toBe("failed");
    expect(events[0].type).toBe("run-init");
    expect(events.some((event) => event.type === "step-start")).toBe(true);
    expect(events.some((event) => event.type === "step-finish")).toBe(false);
    expect(events.some((event) => event.type === "run-final")).toBe(false);
  });
});
