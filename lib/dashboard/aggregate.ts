import { workflowKinds, type RunResult, type WorkflowKind } from "@/lib/domain/types";

export type WorkflowSummary = {
  workflow: WorkflowKind;
  count: number;
  resolvedCount: number;
  resolveRate: number;
  avgValue: number;
  avgCost: number;
  avgLatencyMs: number;
  avgTestPassRate: number;
};

type LegacyEvaluation = {
  resolved?: boolean;
  valueScore?: number;
  testsPassed?: number;
  testsTotal?: number;
};

function num(value: number | undefined): number {
  return typeof value === "number" && !Number.isNaN(value) ? value : 0;
}

function zeroedSummary(workflow: WorkflowKind): WorkflowSummary {
  return {
    workflow,
    count: 0,
    resolvedCount: 0,
    resolveRate: 0,
    avgValue: 0,
    avgCost: 0,
    avgLatencyMs: 0,
    avgTestPassRate: 0,
  };
}

function evaluationOf(run: RunResult): LegacyEvaluation {
  return (run.evaluation ?? {}) as LegacyEvaluation;
}

function testPassRate(run: RunResult): number {
  const evaluation = evaluationOf(run);
  return num(evaluation.testsPassed) / Math.max(num(evaluation.testsTotal), 1);
}

export function summarizeByWorkflow(runs: RunResult[]): WorkflowSummary[] {
  return workflowKinds.map((workflow) => {
    const workflowRuns = runs.filter((run) => run.workflow === workflow);
    const count = workflowRuns.length;

    if (count === 0) {
      return zeroedSummary(workflow);
    }

    const resolvedCount = workflowRuns.filter((run) => evaluationOf(run).resolved === true).length;

    const totals = workflowRuns.reduce(
      (acc, run) => {
        const evaluation = evaluationOf(run);
        acc.value += num(evaluation.valueScore);
        acc.cost += num(run.costUsd as number | undefined);
        acc.latency += num(run.latencyMs as number | undefined);
        acc.testPassRate += testPassRate(run);
        return acc;
      },
      { value: 0, cost: 0, latency: 0, testPassRate: 0 }
    );

    return {
      workflow,
      count,
      resolvedCount,
      resolveRate: resolvedCount / count,
      avgValue: totals.value / count,
      avgCost: totals.cost / count,
      avgLatencyMs: totals.latency / count,
      avgTestPassRate: totals.testPassRate / count,
    };
  });
}

export function chartableSummaries(summaries: WorkflowSummary[]): WorkflowSummary[] {
  return summaries.filter((summary) => summary.count > 0);
}
