import type { WorkflowKind } from "@/lib/domain/types";

/** Human-readable names for each workflow, shared across all pages. */
export const workflowLabels: Record<WorkflowKind, string> = {
  single_cheap: "Single Cheap Model",
  single_strong: "Single Strong Model",
  panel_judge: "Panel + Judge",
  cheap_first: "Cheap-First Escalation",
  planner_worker_verifier: "Planner → Worker → Verifier"
};

/** Falls back to the raw key for any unknown workflow value. */
export function workflowLabel(workflow: string): string {
  return workflowLabels[workflow as WorkflowKind] ?? workflow;
}
