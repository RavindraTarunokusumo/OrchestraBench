import { describe, expect, it } from "vitest";
import { runWorkflow } from "@/lib/workflows/runner";
import { createMockProvider } from "@/lib/providers/mock-provider";
import type { WorkflowKind } from "@/lib/domain/types";
import type { ModelProvider } from "@/lib/providers/types";

const baseInput = {
  title: "Review auth helper",
  language: "TypeScript",
  prompt: "Find bugs in this code.",
  code: "function isAllowed(user?: { role: string }) { return user!.role === 'admin' }",
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
      provider: createMockProvider()
    });

    expect(result.status).toBe("completed");
    expect(result.workflow).toBe(workflow);
    expect(result.finalAnswer.length).toBeGreaterThan(0);
    expect(result.calls.length).toBeGreaterThan(0);
    expect(result.evaluation.valueScore).toBeGreaterThan(0);
  });

  it("marks cheap-first escalation reason when verifier confidence is low", async () => {
    const result = await runWorkflow({
      input: { ...baseInput, workflow: "cheap_first" },
      provider: createMockProvider({ verifierConfidence: 0.35 })
    });

    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toContain("0.35");
    expect(result.calls.map((call) => call.role)).toContain("strong_reviewer");
  });

  it("allows free-model escalation even when the cost limit is tiny", async () => {
    const result = await runWorkflow({
      input: { ...baseInput, workflow: "cheap_first", costLimitUsd: 0.0001 },
      provider: createMockProvider({ verifierConfidence: 0.2 })
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
      provider: failingProvider
    });

    expect(result.status).toBe("failed");
    expect(result.failureNotes).toContain("provider unavailable");
    expect(result.calls[0]).toMatchObject({
      role: "cheap_reviewer",
      provider: "Failing provider",
      error: "provider unavailable"
    });
  });

  it("scores missed known bugs instead of always reporting a true positive", async () => {
    const result = await runWorkflow({
      input: {
        ...baseInput,
        workflow: "single_cheap",
        knownBugs: [
          {
            id: "bug_sql",
            title: "SQL injection in search",
            description: "Search concatenates user input into SQL.",
            severity: "critical"
          }
        ]
      },
      provider: createMockProvider()
    });

    expect(result.evaluation.truePositives).toBe(0);
    expect(result.evaluation.missedKnownBugs).toBe(1);
  });
});
