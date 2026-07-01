"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Benchmark } from "@/lib/benchmarks/catalog";
import type { BenchmarkTask, RunResult } from "@/lib/domain/types";

export type BenchmarkTaskSummary = {
  task: BenchmarkTask;
  runCount: number;
  resolvedCount: number;
  resolveRate: number;
  runnable: boolean;
};

type BenchmarkDetailClientProps = {
  benchmark: Benchmark;
  taskSummaries: BenchmarkTaskSummary[];
  selectedTaskId: string | null;
};

function taskStatsForRuns(taskId: string, runs: RunResult[]) {
  const related = runs.filter((run) => run.benchmarkTaskId === taskId);
  const runCount = related.length;
  const resolvedCount = related.filter((run) => run.evaluation.resolved).length;
  const resolveRate = runCount > 0 ? resolvedCount / runCount : 0;
  return { runCount, resolvedCount, resolveRate, related };
}

export function enrichTaskSummaries(
  summaries: BenchmarkTaskSummary[],
  runs: RunResult[]
): BenchmarkTaskSummary[] {
  return summaries.map((summary) => {
    const stats = taskStatsForRuns(summary.task.id, runs);
    return {
      ...summary,
      runCount: stats.runCount,
      resolvedCount: stats.resolvedCount,
      resolveRate: stats.resolveRate
    };
  });
}

export function BenchmarkDetailClient({
  benchmark,
  taskSummaries,
  selectedTaskId
}: BenchmarkDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedSummary = taskSummaries.find((summary) => summary.task.id === selectedTaskId) ?? null;
  const selectedTask = selectedSummary?.task ?? null;
  const runnableCount = taskSummaries.filter((summary) => summary.runnable).length;
  const skippedCount = taskSummaries.length - runnableCount;

  function selectTask(taskId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", taskId);
    router.replace(`/benchmarks/${benchmark.slug}?${params.toString()}`, { scroll: false });
  }

  function clearSelection() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const query = params.toString();
    router.replace(query ? `/benchmarks/${benchmark.slug}?${query}` : `/benchmarks/${benchmark.slug}`, {
      scroll: false
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex flex-col gap-3">
        {taskSummaries.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-10 text-center">
              No tasks in this benchmark yet. Run <code className="font-mono">npm run ingest:quixbugs</code> to
              populate QuixBugs.
            </CardContent>
          </Card>
        ) : (
          taskSummaries.map((summary) => {
            const { task } = summary;
            const isSelected = task.id === selectedTaskId;
            const statsLabel =
              summary.runCount === 0
                ? "No runs"
                : `${(summary.resolveRate * 100).toFixed(0)}% resolved (${summary.resolvedCount}/${summary.runCount})`;

            return (
              <details key={task.id} className="group rounded-lg border bg-card" open={isSelected}>
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden"
                  onClick={(event) => {
                    event.preventDefault();
                    if (isSelected) {
                      clearSelection();
                    } else {
                      selectTask(task.id);
                    }
                  }}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{task.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {task.language} · {statsLabel}
                      {!summary.runnable ? " · missing tests" : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!summary.runnable ? <Badge variant="secondary">Skipped in bulk</Badge> : null}
                    {isSelected ? <Badge variant="outline">Selected</Badge> : null}
                  </div>
                </summary>
                <div className="border-t px-4 pb-4">
                  <p className="text-muted-foreground mb-2 line-clamp-2 text-sm">{task.prompt}</p>
                  <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                    {task.code}
                  </pre>
                </div>
              </details>
            );
          })
        )}

        {skippedCount > 0 ? (
          <p className="text-muted-foreground text-sm">
            {skippedCount} task{skippedCount === 1 ? "" : "s"} missing test code and will be skipped in bulk runs.
          </p>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        {selectedTask && selectedSummary ? (
          <Card>
            <CardHeader>
              <CardTitle>{selectedTask.title}</CardTitle>
              <CardDescription>
                {selectedTask.language} · {selectedTask.source}
                {selectedTask.tags.length > 0 ? ` · ${selectedTask.tags.join(", ")}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm">{selectedTask.prompt}</p>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Buggy code</h3>
                <pre className="bg-muted max-h-48 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                  {selectedTask.code}
                </pre>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Test code</h3>
                <pre className="bg-muted max-h-32 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                  {selectedTask.testCode || "No test code provided."}
                </pre>
              </div>

              {selectedTask.referenceFix ? (
                <details className="rounded-lg border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Reveal reference fix</summary>
                  <pre className="overflow-auto px-3 pb-3 font-mono text-xs whitespace-pre-wrap">
                    {selectedTask.referenceFix}
                  </pre>
                </details>
              ) : null}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Runs</span>
                  <p className="font-medium">{selectedSummary.runCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Resolve rate</span>
                  <p className="font-medium">
                    {selectedSummary.runCount === 0
                      ? "—"
                      : `${(selectedSummary.resolveRate * 100).toFixed(0)}%`}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {selectedSummary.runnable ? (
                  <Button asChild>
                    <Link
                      href={`/runs/new?taskId=${selectedTask.id}&benchmark=${benchmark.slug}`}
                    >
                      Run this task
                    </Link>
                  </Button>
                ) : (
                  <p className="text-muted-foreground text-sm">This task needs test code before it can run.</p>
                )}
                <Button variant="outline" type="button" onClick={clearSelection}>
                  Close panel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Task details</CardTitle>
              <CardDescription>Select a task from the list to inspect prompt, code, and stats.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Click any task row to open the side panel. Use <strong>Run this task</strong> for the orchestration
              canvas experience.
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  );
}
