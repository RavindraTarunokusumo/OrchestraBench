import { describe, expect, it } from "vitest";
import { createMockExecutor } from "@/lib/execution/mock-executor";
import { runWorkflow } from "@/lib/workflows/runner";
import { createMockProvider } from "@/lib/providers/mock-provider";
import type { WorkflowKind } from "@/lib/domain/types";
import type { ModelProvider } from "@/lib/providers/types";

const mockExecutor = createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 });

const baseInput = {
  title: "Review auth helper",
  language: "TypeScript",
  prompt: "Find bugs in this code.",
  code: "function isAllowed(user?: { role: string }) { return user!.role === 'admin' }",
  testCode: "assert isAllowed({ role: 'admin' }) === true",
  costLimitUsd: 0.02
};

describe("runWorkflow", () => {
  it.each<WorkflowKind>([
    "single_cheap",
    "single_strong",
    "panel_judge",
    "cheap_first",
    "planner_worker_verifier"
  ])("returns a normalized completed run for %s", async (workflow) => {
    const result = await runWorkflow({
      input: { ...baseInput, workflow },
      provider: createMockProvider(),
      executor: mockExecutor
    });

    expect(result.status).toBe("completed");
    expect(result.workflow).toBe(workflow);
    expect(result.finalAnswer.length).toBeGreaterThan(0);
    expect(result.calls.length).toBeGreaterThan(0);
    expect(result.evaluation.valueScore).toBeGreaterThan(0);
    expect(result.execution.resolved).toBe(true);
    expect(result.candidateCode.length).toBeGreaterThan(0);
  });

  it("returns a resolved repair run", async () => {
    const result = await runWorkflow({
      input: {
        title: "gcd",
        language: "python",
        prompt: "Fix it.",
        code: "def gcd(a,b): return a",
        workflow: "single_cheap",
        testCode: "assert gcd(4,2)==2",
        entryPoint: "gcd"
      },
      provider: createMockProvider(),
      executor: createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 })
    });
    expect(result.status).toBe("completed");
    expect(result.execution.resolved).toBe(true);
    expect(result.candidateCode.length).toBeGreaterThan(0);
  });

  it("marks cheap-first escalation reason when verifier confidence is low", async () => {
    const result = await runWorkflow({
      input: { ...baseInput, workflow: "cheap_first" },
      provider: createMockProvider({ verifierConfidence: 0.35 }),
      executor: mockExecutor
    });

    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toContain("0.35");
    expect(result.calls.map((call) => call.role)).toContain("strong_reviewer");
  });

  it("allows free-model escalation even when the cost limit is tiny", async () => {
    const result = await runWorkflow({
      input: { ...baseInput, workflow: "cheap_first", costLimitUsd: 0.0001 },
      provider: createMockProvider({ verifierConfidence: 0.2 }),
      executor: mockExecutor
    });

    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toContain("0.20");
  });

  it("returns a failed run with trace information when the provider fails", async () => {
    const failingProvider: ModelProvider = {
      label: "Failing provider",
      async complete() {
        throw new Error("provider unavailable");
      }
    };

    const result = await runWorkflow({
      input: { ...baseInput, workflow: "single_cheap" },
      provider: failingProvider,
      executor: mockExecutor
    });

    expect(result.status).toBe("failed");
    expect(result.failureNotes).toContain("provider unavailable");
    expect(result.candidateCode).toBe("");
    expect(result.execution.resolved).toBe(false);
    expect(result.calls[0]).toMatchObject({
      role: "cheap_reviewer",
      provider: "Failing provider",
      error: "provider unavailable"
    });
  });

  it("feeds the worker fix and verifier critique into the finalizer for planner_worker_verifier", async () => {
    const result = await runWorkflow({
      input: { ...baseInput, workflow: "planner_worker_verifier" },
      provider: createMockProvider(),
      executor: mockExecutor
    });

    const finalizer = result.calls.find((call) => call.role === "finalizer");
    const worker = result.calls.find((call) => call.role === "worker");
    expect(finalizer).toBeDefined();
    expect(worker).toBeDefined();
    expect(finalizer?.prompt).toContain("A worker proposed this fix:");
    expect(finalizer?.prompt).toContain(worker!.response);
  });

  it("returns partial status when execution does not resolve", async () => {
    const result = await runWorkflow({
      input: { ...baseInput, workflow: "single_cheap" },
      provider: createMockProvider(),
      executor: createMockExecutor({ resolved: false, testsPassed: 0, testsTotal: 1 })
    });

    expect(result.status).toBe("partial");
    expect(result.execution.resolved).toBe(false);
    expect(result.evaluation.resolved).toBe(false);
  });
});
