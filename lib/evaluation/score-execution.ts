import type { Evaluation, ExecutionResult } from "@/lib/domain/types";

const COST_FLOOR = 0.0001;

export function scoreExecution(
  execution: ExecutionResult,
  costUsd: number
): Pick<Evaluation, "resolved" | "testsPassed" | "testsTotal" | "valueScore"> {
  const fraction =
    execution.testsTotal > 0 ? execution.testsPassed / execution.testsTotal : 0;
  const credit = execution.resolved ? 1 : fraction;
  return {
    resolved: execution.resolved,
    testsPassed: execution.testsPassed,
    testsTotal: execution.testsTotal,
    valueScore: credit / Math.max(costUsd, COST_FLOOR)
  };
}
