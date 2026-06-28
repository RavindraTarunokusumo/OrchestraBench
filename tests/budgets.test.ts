import { describe, expect, it } from "vitest";
import { workflowKinds } from "@/lib/domain/types";
import { checkBudget, workflowBudgets } from "@/lib/workflows/budgets";

describe("workflowBudgets", () => {
  it.each(workflowKinds)("has an entry for %s", (kind) => {
    expect(workflowBudgets[kind]).toBeDefined();
    expect(workflowBudgets[kind].costUsd).toBeGreaterThan(0);
    expect(workflowBudgets[kind].latencyMs).toBeGreaterThan(0);
  });
});

describe("checkBudget", () => {
  it("returns withinBudget true when cost and latency are under budget", () => {
    const status = checkBudget("single_cheap", 0.005, 10000);
    expect(status.withinBudget).toBe(true);
    expect(status.withinCost).toBe(true);
    expect(status.withinLatency).toBe(true);
    expect(status.budget).toEqual(workflowBudgets.single_cheap);
  });

  it("returns withinBudget false when cost exceeds budget", () => {
    const status = checkBudget("single_cheap", 0.02, 10000);
    expect(status.withinBudget).toBe(false);
    expect(status.withinCost).toBe(false);
    expect(status.withinLatency).toBe(true);
    expect(status.budget).toEqual(workflowBudgets.single_cheap);
  });

  it("returns withinBudget false when latency exceeds budget", () => {
    const status = checkBudget("single_cheap", 0.005, 20000);
    expect(status.withinBudget).toBe(false);
    expect(status.withinCost).toBe(true);
    expect(status.withinLatency).toBe(false);
    expect(status.budget).toEqual(workflowBudgets.single_cheap);
  });
});
