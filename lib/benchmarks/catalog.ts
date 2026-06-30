import type { BenchmarkTask, RunResult } from "@/lib/domain/types";

export type Benchmark = {
  slug: string;
  name: string;
  source: BenchmarkTask["source"];
  description?: string;
  taskCount: number;
  resolvedRate: number;
};

const BENCHMARK_ORDER: BenchmarkTask["source"][] = ["quixbugs", "manual"];

const SLUG_BY_SOURCE: Record<BenchmarkTask["source"], string> = {
  quixbugs: "quixbugs",
  manual: "custom",
};

const NAME_BY_SOURCE: Record<BenchmarkTask["source"], string> = {
  quixbugs: "QuixBugs",
  manual: "Custom",
};

const SOURCE_BY_SLUG: Record<string, BenchmarkTask["source"]> = {
  quixbugs: "quixbugs",
  custom: "manual",
};

export function benchmarkSlugForSource(source: BenchmarkTask["source"]): string {
  return SLUG_BY_SOURCE[source];
}

export function benchmarkNameForSource(source: BenchmarkTask["source"]): string {
  return NAME_BY_SOURCE[source];
}

function sourceForSlug(slug: string): BenchmarkTask["source"] | undefined {
  return SOURCE_BY_SLUG[slug];
}

function resolvedRateForTasks(tasks: BenchmarkTask[], runs: RunResult[]): number {
  if (tasks.length === 0) {
    return 0;
  }

  const taskIds = new Set(tasks.map((task) => task.id));
  const relatedRuns = runs.filter(
    (run) => run.benchmarkTaskId !== undefined && taskIds.has(run.benchmarkTaskId),
  );

  if (relatedRuns.length === 0) {
    return 0;
  }

  const resolvedCount = relatedRuns.filter((run) => run.evaluation.resolved).length;
  return resolvedCount / relatedRuns.length;
}

function buildBenchmark(source: BenchmarkTask["source"], tasks: BenchmarkTask[], runs: RunResult[]): Benchmark {
  const benchmarkTasks = tasks.filter((task) => task.source === source);

  return {
    slug: benchmarkSlugForSource(source),
    name: benchmarkNameForSource(source),
    source,
    taskCount: benchmarkTasks.length,
    resolvedRate: resolvedRateForTasks(benchmarkTasks, runs),
  };
}

export function listBenchmarks(tasks: BenchmarkTask[], runs: RunResult[]): Benchmark[] {
  const sources = new Set(tasks.map((task) => task.source));

  return BENCHMARK_ORDER.filter((source) => sources.has(source)).map((source) =>
    buildBenchmark(source, tasks, runs),
  );
}

export function getBenchmark(
  slug: string,
  tasks: BenchmarkTask[],
  runs: RunResult[],
): Benchmark | undefined {
  const source = sourceForSlug(slug);
  if (!source) {
    return undefined;
  }

  const benchmarkTasks = tasks.filter((task) => task.source === source);
  if (benchmarkTasks.length === 0) {
    return undefined;
  }

  return buildBenchmark(source, tasks, runs);
}

export function tasksForBenchmark(slug: string, tasks: BenchmarkTask[]): BenchmarkTask[] {
  const source = sourceForSlug(slug);
  if (!source) {
    return [];
  }

  return tasks.filter((task) => task.source === source);
}
