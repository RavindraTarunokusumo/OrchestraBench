import { describe, expect, it } from "vitest";
import type { RunResult } from "@/lib/domain/types";
import { normalizeRun } from "@/lib/store/file-store";

function buildModernRun(): RunResult {
  return {
    id: "run_modern",
    workflow: "single_cheap",
    status: "completed",
    title: "Modern run",
    language: "python",
    prompt: "Fix it.",
    code: "def f(): pass",
    providerLabel: "Mock provider",
    finalAnswer: "```python\ndef f(): return 1\n```",
    candidateCode: "def f(): return 1",
    execution: {
      resolved: true,
      testsPassed: 1,
      testsTotal: 1,
      exitCode: 0,
      timedOut: false,
      stdout: "ok",
      stderr: "",
      durationMs: 12,
      backend: "mock"
    },
    calls: [
      {
        id: "call_1",
        role: "cheap_reviewer",
        provider: "mock",
        model: "mock/cheap",
        prompt: "Fix it.",
        response: "```python\ndef f(): return 1\n```",
        usage: { inputTokens: 10, outputTokens: 20 },
        estimatedCostUsd: 0,
        latencyMs: 25
      }
    ],
    evaluation: {
      resolved: true,
      testsPassed: 1,
      testsTotal: 1,
      valueScore: 0.75
    },
    costUsd: 0.001,
    latencyMs: 50,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z"
  };
}

describe("normalizeRun", () => {
  it("fills safe defaults for legacy runs missing execution and evaluation", () => {
    const legacy = {
      id: "run_legacy",
      workflow: "panel_judge",
      status: "completed",
      title: "Legacy review run",
      language: "TypeScript",
      prompt: "Find bugs.",
      code: "const x = 1;",
      providerLabel: "Mock provider",
      finalAnswer: "Found a bug.",
      calls: "not-an-array",
      findings: [{ title: "null access", severity: "high" }],
      qualityScore: 0.8,
      startedAt: "2025-06-01T00:00:00.000Z",
      completedAt: "2025-06-01T00:00:05.000Z"
    } as unknown as RunResult;

    const normalized = normalizeRun(legacy);

    expect(normalized.id).toBe("run_legacy");
    expect(normalized.workflow).toBe("panel_judge");
    expect(normalized.title).toBe("Legacy review run");
    expect(normalized.candidateCode).toBe("");
    expect(normalized.finalAnswer).toBe("Found a bug.");
    expect(normalized.calls).toEqual([]);
    expect(normalized.costUsd).toBe(0);
    expect(normalized.latencyMs).toBe(0);
    expect(normalized.execution).toEqual({
      resolved: false,
      testsPassed: 0,
      testsTotal: 0,
      exitCode: null,
      timedOut: false,
      stdout: "",
      stderr: "",
      durationMs: 0,
      backend: "mock"
    });
    expect(normalized.evaluation).toEqual({
      resolved: false,
      testsPassed: 0,
      testsTotal: 0,
      valueScore: 0
    });
    expect((normalized as RunResult & { findings?: unknown }).findings).toEqual([
      { title: "null access", severity: "high" }
    ]);
  });

  it("passes a complete modern run through unchanged", () => {
    const modern = buildModernRun();
    expect(normalizeRun(modern)).toEqual(modern);
  });
});
