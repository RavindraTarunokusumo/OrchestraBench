import { describe, expect, it } from "vitest";
import type { RunResult } from "@/lib/domain/types";
import { runsToCsv } from "@/lib/export/runs-csv";

const HEADER =
  "id,title,workflow,status,language,resolved,testsPassed,testsTotal,valueScore,costUsd,latencyMs,executionMs,startedAt,completedAt,benchmarkTaskId";

function minimalRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    id: "run_1",
    workflow: "single_cheap",
    status: "completed",
    title: "Test run",
    language: "python",
    prompt: "p",
    code: "c",
    providerLabel: "Mock",
    finalAnswer: "a",
    candidateCode: "cc",
    execution: {
      resolved: true,
      testsPassed: 2,
      testsTotal: 3,
      exitCode: 0,
      timedOut: false,
      stdout: "",
      stderr: "",
      durationMs: 100,
      backend: "mock"
    },
    calls: [],
    evaluation: {
      resolved: true,
      testsPassed: 2,
      testsTotal: 3,
      valueScore: 0.5
    },
    costUsd: 0.01,
    latencyMs: 200,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    ...overrides
  };
}

describe("runsToCsv", () => {
  it("emits the exact header row", () => {
    const csv = runsToCsv([]);
    expect(csv.split("\n")[0]).toBe(HEADER);
  });

  it("maps run fields to comma-separated values", () => {
    const run = minimalRun();
    const csv = runsToCsv([run]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      "run_1,Test run,single_cheap,completed,python,true,2,3,0.5,0.01,200,100,2026-01-01T00:00:00.000Z,2026-01-01T00:00:01.000Z,"
    );
  });

  it("maps resolved false and empty benchmarkTaskId", () => {
    const run = minimalRun({
      evaluation: { resolved: false, testsPassed: 0, testsTotal: 1, valueScore: 0 }
    });
    const csv = runsToCsv([run]);
    const row = csv.split("\n")[1];
    expect(row).toContain(",false,0,1,0,");
    expect(row?.endsWith(",")).toBe(true);
  });

  it("escapes titles with commas and quotes", () => {
    const run = minimalRun({ title: 'Hello, "world"' });
    const csv = runsToCsv([run]);
    const row = csv.split("\n")[1];
    expect(row).toContain('"Hello, ""world"""');
  });
});
