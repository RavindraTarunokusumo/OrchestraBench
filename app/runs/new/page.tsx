import { notFound, redirect } from "next/navigation";
import { NewRunClient } from "@/app/runs/new/new-run-client";
import { benchmarkNameForSource, benchmarkSlugForSource, getBenchmark } from "@/lib/benchmarks/catalog";
import { getDataset, listDatasets, listRuns } from "@/lib/store/file-store";
import { getDefaultCheapModel, getDefaultStrongModel } from "@/lib/workflows/model-defaults";

type PageProps = {
  searchParams: Promise<{ taskId?: string; benchmark?: string }>;
};

export default async function NewRunPage({ searchParams }: PageProps) {
  const { taskId, benchmark: benchmarkQuery } = await searchParams;

  if (!taskId?.trim()) {
    redirect("/dashboard");
  }

  const task = await getDataset(taskId);
  if (!task) {
    notFound();
  }

  const benchmarkSlug = benchmarkQuery?.trim() || benchmarkSlugForSource(task.source);
  const [tasks, runs] = await Promise.all([listDatasets(), listRuns()]);
  const benchmark = getBenchmark(benchmarkSlug, tasks, runs);
  const benchmarkName = benchmark?.name ?? benchmarkNameForSource(task.source);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run task</h1>
        <p className="text-muted-foreground">
          Execute {task.title} with live orchestration visualization on the canvas.
        </p>
      </div>
      <NewRunClient
        task={task}
        benchmarkSlug={benchmarkSlug}
        benchmarkName={benchmarkName}
        modelDefaults={{
          cheapModel: getDefaultCheapModel(),
          strongModel: getDefaultStrongModel()
        }}
      />
    </main>
  );
}
