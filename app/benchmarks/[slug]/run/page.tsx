import Link from "next/link";
import { notFound } from "next/navigation";
import { BenchmarkRunClient } from "@/components/benchmarks/benchmark-run-client";
import { Button } from "@/components/ui/button";
import { getBenchmark, tasksForBenchmark } from "@/lib/benchmarks/catalog";
import { listDatasets, listRuns } from "@/lib/store/file-store";
import { getDefaultCheapModel, getDefaultStrongModel } from "@/lib/workflows/model-defaults";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function isRunnableTask(task: { testCode?: string }): boolean {
  return Boolean(task.testCode?.trim());
}

export default async function BenchmarkRunPage({ params }: PageProps) {
  const { slug } = await params;
  const [tasks, runs] = await Promise.all([listDatasets(), listRuns()]);
  const benchmark = getBenchmark(slug, tasks, runs);

  if (!benchmark) {
    notFound();
  }

  const benchmarkTasks = tasksForBenchmark(slug, tasks);
  const runnableTasks = benchmarkTasks.filter(isRunnableTask);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run {benchmark.name}</h1>
          <p className="text-muted-foreground">
            Execute all runnable tasks sequentially with a single workflow configuration.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/benchmarks/${slug}`}>Back to benchmark</Link>
        </Button>
      </div>

      <BenchmarkRunClient
        slug={slug}
        benchmarkName={benchmark.name}
        runnableTaskCount={runnableTasks.length}
        totalTaskCount={benchmarkTasks.length}
        modelDefaults={{
          cheapModel: getDefaultCheapModel(),
          strongModel: getDefaultStrongModel()
        }}
      />
    </main>
  );
}
