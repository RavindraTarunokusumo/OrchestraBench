import { describe, expect, it } from "vitest";
import type { RunResult } from "@/lib/domain/types";
import { getRun, saveRun } from "@/lib/store/file-store";
import { createMockProvider } from "@/lib/providers/mock-provider";
import { runWorkflow } from "@/lib/workflows/runner";
import type { WorkflowEvent } from "@/lib/workflows/events";

const baseInput = {
  title: "Review auth helper",
  language: "TypeScript",
  prompt: "Find bugs in this code.",
  code: "function isAllowed(user?: { role: string }) { return user!.role === 'admin' }",
  costLimitUsd: 0.02
};

function buildHandRolledRunResult(): RunResult {
  return {
    id: `run_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    workflow: "single_cheap",
    status: "completed",
    title: "Hand-rolled run",
    language: "TypeScript",
    prompt: "Find bugs.",
    code: "export const ok = true;",
    providerLabel: "Mock provider",
    finalAnswer: "No bugs found.",
    findings: [],
    calls: [],
    evaluation: {
      truePositives: 0,
      falsePositives: 0,
      missedKnownBugs: 0,
      highSeverityTruePositives: 0,
      qualityScore: 0.5,
      valueScore: 0.5,
      judgeConfidence: 0.5
    },
    costUsd: 0,
    latencyMs: 0,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
}

describe("saveRun", () => {
  it("persists a pre-computed RunResult without invoking the runner", async () => {
    const handRolled = buildHandRolledRunResult();

    const saved = await saveRun(handRolled);
    expect(saved).toEqual(handRolled);

    const fetched = await getRun(handRolled.id);
    expect(fetched).toEqual(handRolled);
  });
});

describe("SSE serialization (route-equivalent)", () => {
  it("serializes every emitted WorkflowEvent plus a synthesized run-final into valid SSE data lines", async () => {
    const lines: string[] = [];
    const send = (event: WorkflowEvent) => {
      lines.push(`data: ${JSON.stringify(event)}\n\n`);
    };

    const result = await runWorkflow({
      input: { ...baseInput, workflow: "single_cheap" },
      provider: createMockProvider(),
      onEvent: send
    });
    const saved = await saveRun(result);
    send({
      type: "run-final",
      runId: saved.id,
      status: saved.status,
      costUsd: saved.costUsd,
      latencyMs: saved.latencyMs,
      findingsCount: saved.findings.length,
      qualityScore: saved.evaluation.qualityScore,
      valueScore: saved.evaluation.valueScore
    });

    expect(lines.length).toBeGreaterThan(0);

    const parsedEvents = lines.map((line) => {
      expect(line.startsWith("data: ")).toBe(true);
      expect(line.endsWith("\n\n")).toBe(true);
      const jsonText = line.slice("data: ".length, -2);
      return JSON.parse(jsonText) as WorkflowEvent;
    });

    const finalEvent = parsedEvents.at(-1);
    expect(finalEvent?.type).toBe("run-final");
    if (finalEvent?.type === "run-final") {
      expect(finalEvent.runId).toBe(saved.id);
      expect(finalEvent.status).toBe("completed");
      expect(finalEvent.costUsd).toBe(saved.costUsd);
      expect(finalEvent.latencyMs).toBe(saved.latencyMs);
      expect(finalEvent.findingsCount).toBe(saved.findings.length);
      expect(finalEvent.qualityScore).toBe(saved.evaluation.qualityScore);
      expect(finalEvent.valueScore).toBe(saved.evaluation.valueScore);
    }

    const fetched = await getRun(saved.id);
    expect(fetched?.id).toBe(saved.id);
  });
});
