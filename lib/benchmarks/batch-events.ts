import type { WorkflowKind } from "@/lib/domain/types";

export type BenchmarkStartEvent = {
  type: "benchmark-start";
  batchId: string;
  slug: string;
  name: string;
  taskTotal: number;
  workflow: WorkflowKind;
};

export type TaskStartEvent = {
  type: "task-start";
  batchId: string;
  taskIndex: number;
  taskTotal: number;
  taskId: string;
  taskTitle: string;
};

export type TaskFinalEvent = {
  type: "task-final";
  batchId: string;
  taskIndex: number;
  taskId: string;
  runId: string;
  resolved: boolean;
  costUsd: number;
  latencyMs: number;
};

export type TaskErrorEvent = {
  type: "task-error";
  batchId: string;
  taskIndex: number;
  taskId: string;
  error: string;
};

export type BenchmarkFinalEvent = {
  type: "benchmark-final";
  batchId: string;
  completed: number;
  failed: number;
  runIds: string[];
  aggregateResolvedRate: number;
};

export type BatchRunErrorEvent = {
  type: "run-error";
  message: string;
};

export type BatchEvent =
  | BenchmarkStartEvent
  | TaskStartEvent
  | TaskFinalEvent
  | TaskErrorEvent
  | BenchmarkFinalEvent
  | BatchRunErrorEvent;

export type BenchmarkEventHandler = (event: BatchEvent) => void;
