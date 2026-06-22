export type EvaluationScoreInput = {
  truePositives: number;
  falsePositives: number;
  missedKnownBugs: number;
  highSeverityTruePositives: number;
  costUsd: number;
};

export type EvaluationScores = {
  qualityScore: number;
  valueScore: number;
};

export function computeEvaluationScores(input: EvaluationScoreInput): EvaluationScores {
  const qualityScore =
    input.truePositives * 3 +
    input.highSeverityTruePositives * 2 -
    input.falsePositives * 1.5 -
    input.missedKnownBugs * 2;

  const valueScore = qualityScore / Math.max(input.costUsd, 0.0001);

  return {
    qualityScore,
    valueScore
  };
}
