import { describe, expect, it } from "vitest";
import { computeEvaluationScores } from "@/lib/evaluation/metrics";

describe("computeEvaluationScores", () => {
  it("computes quality and value scores with the SPEC formula", () => {
    const scores = computeEvaluationScores({
      truePositives: 4,
      falsePositives: 1,
      missedKnownBugs: 2,
      highSeverityTruePositives: 1,
      costUsd: 0.5
    });

    expect(scores.qualityScore).toBe(8.5);
    expect(scores.valueScore).toBe(17);
  });

  it("uses the minimum denominator for zero-cost mock runs", () => {
    const scores = computeEvaluationScores({
      truePositives: 1,
      falsePositives: 0,
      missedKnownBugs: 0,
      highSeverityTruePositives: 0,
      costUsd: 0
    });

    expect(scores.valueScore).toBe(30000);
  });
});
