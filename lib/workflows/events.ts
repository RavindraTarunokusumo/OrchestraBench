import type { ModelRole, ModelUsage, RunStatus, WorkflowKind } from "@/lib/domain/types";
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
  | {
      type: "run-final";
      runId: string;
      status: RunStatus;
      costUsd: number;
      latencyMs: number;
      findingsCount: number;
      qualityScore: number;
      valueScore: number;
    }
  | { type: "run-error"; message: string };

export type WorkflowEventHandler = (event: WorkflowEvent) => void;
