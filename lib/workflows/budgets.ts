import type { WorkflowKind } from "@/lib/domain/types";

export type WorkflowBudget = { costUsd: number; latencyMs: number };

export const workflowBudgets: Record<WorkflowKind, WorkflowBudget> = {
  single_cheap: { costUsd: 0.01, latencyMs: 15000 },
  single_strong: { costUsd: 0.05, latencyMs: 20000 },
  panel_judge: { costUsd: 0.05, latencyMs: 30000 },
  cheap_first: { costUsd: 0.03, latencyMs: 25000 },
  planner_worker_verifier: { costUsd: 0.05, latencyMs: 35000 }
};

export type BudgetStatus = {
  budget: WorkflowBudget;
  withinCost: boolean;
  withinLatency: boolean;
  withinBudget: boolean;
};

export function checkBudget(
  workflow: WorkflowKind,
  costUsd: number,
  latencyMs: number
): BudgetStatus {
  const budget = workflowBudgets[workflow];
  const withinCost = costUsd <= budget.costUsd;
  const withinLatency = latencyMs <= budget.latencyMs;
  return {
    budget,
    withinCost,
    withinLatency,
    withinBudget: withinCost && withinLatency
  };
}
