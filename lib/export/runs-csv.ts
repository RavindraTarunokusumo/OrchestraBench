import type { RunResult } from "@/lib/domain/types";

const HEADER =
  "id,title,workflow,status,language,resolved,testsPassed,testsTotal,valueScore,costUsd,latencyMs,executionMs,startedAt,completedAt,benchmarkTaskId";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function runToRow(run: RunResult): string {
  const fields = [
    run.id,
    run.title,
    run.workflow,
    run.status,
    run.language,
    String(run.evaluation.resolved),
    String(run.evaluation.testsPassed),
    String(run.evaluation.testsTotal),
    String(run.evaluation.valueScore),
    String(run.costUsd),
    String(run.latencyMs),
    String(run.execution.durationMs),
    run.startedAt,
    run.completedAt,
    run.benchmarkTaskId ?? ""
  ];
  return fields.map((field) => escapeCsv(String(field))).join(",");
}

export function runsToCsv(runs: RunResult[]): string {
  const rows = runs.map(runToRow);
  return [HEADER, ...rows].join("\n");
}
