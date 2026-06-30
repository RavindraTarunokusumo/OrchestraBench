import type { ExecutionResult, ModelRole, ModelUsage, RunStatus, WorkflowKind } from "@/lib/domain/types";
import type { WorkflowGraph } from "@/lib/workflows/graph";

export type WorkflowEvent =
  | {
      type: "run-init";
      workflow: WorkflowKind;
      graph: WorkflowGraph;
      plannedSteps: { stepId: string; nodeId: string; role: ModelRole; model: string }[];
    }
  | { type: "step-start"; stepId: string; nodeId: string; role: ModelRole; model: string }
  | {
      type: "step-finish";
      stepId: string;
      nodeId: string;
      role: ModelRole;
      model: string;
      usage: ModelUsage;
      costUsd: number;
      latencyMs: number;
      responsePreview: string;
    }
  | { type: "escalation"; escalated: boolean; reason: string }
  | { type: "execution-result"; result: ExecutionResult }
  | {
      type: "run-final";
      runId: string;
      status: RunStatus;
      costUsd: number;
      latencyMs: number;
      executionMs: number;
      resolved: boolean;
      testsPassed: number;
      testsTotal: number;
      valueScore: number;
      candidateCode: string;
    }
  | { type: "run-error"; message: string };

export type WorkflowEventHandler = (event: WorkflowEvent) => void;

import type { BatchEvent } from "@/lib/benchmarks/batch-events";

export type { BatchEvent, BenchmarkEventHandler } from "@/lib/benchmarks/batch-events";

export type SseEvent = WorkflowEvent | BatchEvent;
