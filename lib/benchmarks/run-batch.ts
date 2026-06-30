import { randomUUID } from "node:crypto";
import { getBenchmark, tasksForBenchmark } from "@/lib/benchmarks/catalog";
import type { BatchEvent, BenchmarkEventHandler } from "@/lib/benchmarks/batch-events";
import type { BenchmarkTask, RunConfig } from "@/lib/domain/types";
import type { SandboxExecutor } from "@/lib/execution/executor";
import type { ModelProvider } from "@/lib/providers/types";
import { listDatasets, listRuns, resolveRunInput, saveRun, type RunBatchFields } from "@/lib/store/file-store";
import { runWorkflow } from "@/lib/workflows/runner";

export type RunBenchmarkBatchDeps = {
  provider: ModelProvider;
  executor: SandboxExecutor;
  onEvent?: BenchmarkEventHandler;
};

export type RunBenchmarkBatchResult = {
  batchId: string;
  completed: number;
  failed: number;
  runIds: string[];
  aggregateResolvedRate: number;
};

function isRunnableTask(task: BenchmarkTask): boolean {
  return Boolean(task.testCode?.trim());
}

export async function runBenchmarkBatch(
  slug: string,
  config: RunConfig,
  deps: RunBenchmarkBatchDeps
): Promise<RunBenchmarkBatchResult> {
  const { provider, executor, onEvent } = deps;
  const emit = (event: BatchEvent) => onEvent?.(event);

  const tasks = await listDatasets();
  const runs = await listRuns();
  const benchmark = getBenchmark(slug, tasks, runs);
  if (!benchmark) {
    throw new Error(`Benchmark not found: ${slug}`);
  }

  const benchmarkTasks = tasksForBenchmark(slug, tasks).filter(isRunnableTask);
  const taskTotal = benchmarkTasks.length;
  const batchId = randomUUID();

  emit({
    type: "benchmark-start",
    batchId,
    slug,
    name: benchmark.name,
    taskTotal,
    workflow: config.workflow
  });

  const runIds: string[] = [];
  let completed = 0;
  let failed = 0;
  let resolvedCount = 0;

  for (let taskIndex = 0; taskIndex < benchmarkTasks.length; taskIndex++) {
    const task = benchmarkTasks[taskIndex]!;
    emit({
      type: "task-start",
      batchId,
      taskIndex,
      taskTotal,
      taskId: task.id,
      taskTitle: task.title
    });

    try {
      const input = await resolveRunInput({
        title: task.title,
        language: task.language,
        prompt: task.prompt,
        code: task.code,
        testCode: task.testCode,
        entryPoint: task.entryPoint,
        benchmarkTaskId: task.id,
        workflow: config.workflow,
        costLimitUsd: config.costLimitUsd,
        maxOutputTokens: config.maxOutputTokens,
        cheapModel: config.cheapModel,
        strongModel: config.strongModel
      });

      const result = await runWorkflow({
        input,
        provider,
        executor
      });

      const batchFields: RunBatchFields = {
        batchId,
        batchIndex: taskIndex,
        batchTotal: taskTotal
      };
      const saved = await saveRun(result, batchFields);

      completed++;
      runIds.push(saved.id);
      if (saved.execution.resolved) {
        resolvedCount++;
      }

      emit({
        type: "task-final",
        batchId,
        taskIndex,
        taskId: task.id,
        runId: saved.id,
        resolved: saved.execution.resolved,
        costUsd: saved.costUsd,
        latencyMs: saved.latencyMs
      });
    } catch (error) {
      failed++;
      emit({
        type: "task-error",
        batchId,
        taskIndex,
        taskId: task.id,
        error: error instanceof Error ? error.message : "Unknown task failure."
      });
    }
  }

  const aggregateResolvedRate = completed > 0 ? resolvedCount / completed : 0;

  emit({
    type: "benchmark-final",
    batchId,
    completed,
    failed,
    runIds,
    aggregateResolvedRate
  });

  return {
    batchId,
    completed,
    failed,
    runIds,
    aggregateResolvedRate
  };
}
