import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  BenchmarkDetailClient,
  enrichTaskSummaries
} from "@/components/benchmarks/benchmark-detail-client";
import { Button } from "@/components/ui/button";
import { getBenchmark, tasksForBenchmark } from "@/lib/benchmarks/catalog";
import { listDatasets, listRuns } from "@/lib/store/file-store";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ task?: string }>;
};

export default async function BenchmarkDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { task: selectedTaskId = null } = await searchParams;
  const [tasks, runs] = await Promise.all([listDatasets(), listRuns()]);
  const benchmark = getBenchmark(slug, tasks, runs);

  if (!benchmark) {
    notFound();
  }

  const benchmarkTasks = tasksForBenchmark(slug, tasks).sort((a, b) => a.title.localeCompare(b.title));
  const baseSummaries = benchmarkTasks.map((task) => ({
    task,
    runCount: 0,
    resolvedCount: 0,
    resolveRate: 0,
    runnable: Boolean(task.testCode?.trim())
  }));
  const taskSummaries = enrichTaskSummaries(baseSummaries, runs);

  const validSelectedTaskId =
    selectedTaskId && taskSummaries.some((summary) => summary.task.id === selectedTaskId)
      ? selectedTaskId
      : null;

  const runnableCount = taskSummaries.filter((summary) => summary.runnable).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{benchmark.name}</h1>
          <p className="text-muted-foreground">
            {benchmark.taskCount} task{benchmark.taskCount === 1 ? "" : "s"} ·{" "}
            {(benchmark.resolvedRate * 100).toFixed(0)}% resolved across runs
            {runnableCount < benchmark.taskCount
              ? ` · ${runnableCount} runnable for bulk runs`
              : ""}
          </p>
        </div>
        {runnableCount === 0 ? (
          <Button disabled>Run entire benchmark</Button>
        ) : (
          <Button asChild>
            <Link href={`/benchmarks/${slug}/run`}>Run entire benchmark</Link>
          </Button>
        )}
      </div>

      <Suspense fallback={<p className="text-muted-foreground text-sm">Loading tasks…</p>}>
        <BenchmarkDetailClient
          benchmark={benchmark}
          taskSummaries={taskSummaries}
          selectedTaskId={validSelectedTaskId}
        />
      </Suspense>
    </main>
  );
}
