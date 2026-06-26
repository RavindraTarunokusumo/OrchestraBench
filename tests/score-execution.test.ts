import { describe, expect, it } from "vitest";
import { scoreExecution } from "@/lib/evaluation/score-execution";
import type { ExecutionResult } from "@/lib/domain/types";

function exec(partial: Partial<ExecutionResult>): ExecutionResult {
  return {
    resolved: false, testsPassed: 0, testsTotal: 0, exitCode: null,
    timedOut: false, stdout: "", stderr: "", durationMs: 0, backend: "mock", ...partial
  };
}

describe("scoreExecution", () => {
  it("scores a full resolve as value 1 per cost", () => {
    const score = scoreExecution(exec({ resolved: true, testsPassed: 2, testsTotal: 2 }), 0);
    expect(score.resolved).toBe(true);
    expect(score.valueScore).toBeCloseTo(1 / 0.0001, 5);
  });

  it("gives partial credit when some tests pass", () => {
    const score = scoreExecution(exec({ resolved: false, testsPassed: 1, testsTotal: 4 }), 0);
    expect(score.valueScore).toBeCloseTo(0.25 / 0.0001, 5);
  });

  it("scores zero tests as zero value", () => {
    const score = scoreExecution(exec({ testsTotal: 0 }), 0.5);
    expect(score.valueScore).toBe(0);
  });
});
