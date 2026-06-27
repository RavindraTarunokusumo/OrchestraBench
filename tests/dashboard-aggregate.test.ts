import { describe, expect, it } from "vitest";
import { workflowKinds, type RunResult, type WorkflowKind } from "@/lib/domain/types";
import { chartableSummaries, summarizeByWorkflow } from "@/lib/dashboard/aggregate";

type RunPartial = {
  workflow: WorkflowKind;
  resolved?: boolean;
  valueScore?: number;
  testsPassed?: number;
  testsTotal?: number;
  costUsd?: number;
  latencyMs?: number;
};

function run(partial: RunPartial): RunResult {
  return {
    workflow: partial.workflow,
    costUsd: partial.costUsd ?? 0,
    latencyMs: partial.latencyMs ?? 0,
    evaluation: {
      resolved: partial.resolved ?? false,
      valueScore: partial.valueScore ?? 0,
      testsPassed: partial.testsPassed ?? 0,
      testsTotal: partial.testsTotal ?? 0,
    },
  } as RunResult;
}

function zeroedRow(workflow: WorkflowKind) {
  return {
    workflow,
    count: 0,
    resolvedCount: 0,
    resolveRate: 0,
    avgValue: 0,
    avgCost: 0,
    avgLatencyMs: 0,
    avgTestPassRate: 0,
  };
}

describe("summarizeByWorkflow", () => {
  it("returns five zeroed rows in workflowKinds order for empty input", () => {
    const summaries = summarizeByWorkflow([]);
    expect(summaries).toHaveLength(5);
    expect(summaries.map((s) => s.workflow)).toEqual([...workflowKinds]);
    for (const summary of summaries) {
      expect(summary).toEqual(zeroedRow(summary.workflow));
    }
  });

  it("summarizes a single resolved run in one workflow", () => {
    const summaries = summarizeByWorkflow([
      run({
        workflow: "single_cheap",
        resolved: true,
        valueScore: 10,
        testsPassed: 3,
        testsTotal: 4,
        costUsd: 0.5,
        latencyMs: 1000,
      }),
    ]);

    expect(summaries).toHaveLength(5);
    expect(summaries[0]).toEqual({
      workflow: "single_cheap",
      count: 1,
      resolvedCount: 1,
      resolveRate: 1,
      avgValue: 10,
      avgCost: 0.5,
      avgLatencyMs: 1000,
      avgTestPassRate: 0.75,
    });
    expect(summaries.slice(1)).toEqual(workflowKinds.slice(1).map(zeroedRow));
  });

  it("computes means and resolve rate across multiple workflows", () => {
    const summaries = summarizeByWorkflow([
      run({
        workflow: "panel_judge",
        resolved: true,
        valueScore: 8,
        testsPassed: 2,
        testsTotal: 2,
        costUsd: 1,
        latencyMs: 200,
      }),
      run({
        workflow: "panel_judge",
        resolved: false,
        valueScore: 4,
        testsPassed: 1,
        testsTotal: 4,
        costUsd: 3,
        latencyMs: 400,
      }),
      run({
        workflow: "cheap_first",
        resolved: true,
        valueScore: 6,
        testsPassed: 1,
        testsTotal: 2,
        costUsd: 0.2,
        latencyMs: 50,
      }),
    ]);

    const panel = summaries.find((s) => s.workflow === "panel_judge");
    expect(panel).toEqual({
      workflow: "panel_judge",
      count: 2,
      resolvedCount: 1,
      resolveRate: 0.5,
      avgValue: 6,
      avgCost: 2,
      avgLatencyMs: 300,
      avgTestPassRate: 0.625,
    });

    const cheapFirst = summaries.find((s) => s.workflow === "cheap_first");
    expect(cheapFirst).toEqual({
      workflow: "cheap_first",
      count: 1,
      resolvedCount: 1,
      resolveRate: 1,
      avgValue: 6,
      avgCost: 0.2,
      avgLatencyMs: 50,
      avgTestPassRate: 0.5,
    });

    const zeroed = summaries.filter(
      (s) => s.workflow !== "panel_judge" && s.workflow !== "cheap_first"
    );
    for (const summary of zeroed) {
      expect(summary).toEqual(zeroedRow(summary.workflow));
    }
  });

  it("includes zeroed rows for workflows with no runs", () => {
    const summaries = summarizeByWorkflow([
      run({ workflow: "single_strong", resolved: true, valueScore: 1, costUsd: 1, latencyMs: 1 }),
    ]);

    expect(summaries.map((s) => s.workflow)).toEqual([...workflowKinds]);
    const strong = summaries.find((s) => s.workflow === "single_strong");
    expect(strong?.count).toBe(1);
    expect(summaries.filter((s) => s.workflow !== "single_strong")).toEqual(
      workflowKinds.filter((w) => w !== "single_strong").map(zeroedRow)
    );
  });

  it("handles degenerate near-zero costs without NaN or Infinity", () => {
    const summaries = summarizeByWorkflow([
      run({ workflow: "single_cheap", costUsd: 0.0001, latencyMs: 10, valueScore: 1 }),
      run({ workflow: "single_cheap", costUsd: 0.0001, latencyMs: 20, valueScore: 2 }),
    ]);

    const row = summaries[0];
    expect(row.avgCost).toBeCloseTo(0.0001, 8);
    expect(row.avgLatencyMs).toBe(15);
    expect(row.avgValue).toBe(1.5);
    expect(Number.isFinite(row.avgCost)).toBe(true);
    expect(Number.isNaN(row.avgCost)).toBe(false);
  });

  it("treats missing legacy evaluation fields as zero without throwing", () => {
    const legacy = {
      workflow: "planner_worker_verifier" as WorkflowKind,
      costUsd: 1,
      latencyMs: 100,
      evaluation: {
        resolved: false,
      },
    } as RunResult;

    expect(() => summarizeByWorkflow([legacy])).not.toThrow();

    const row = summarizeByWorkflow([legacy]).find(
      (s) => s.workflow === "planner_worker_verifier"
    );
    expect(row).toEqual({
      workflow: "planner_worker_verifier",
      count: 1,
      resolvedCount: 0,
      resolveRate: 0,
      avgValue: 0,
      avgCost: 1,
      avgLatencyMs: 100,
      avgTestPassRate: 0,
    });
  });
});

describe("chartableSummaries", () => {
  it("drops count-zero rows and preserves order of count-positive rows", () => {
    const summaries = summarizeByWorkflow([
      run({ workflow: "cheap_first", valueScore: 1 }),
      run({ workflow: "panel_judge", valueScore: 2 }),
    ]);

    const chartable = chartableSummaries(summaries);
    expect(chartable.map((s) => s.workflow)).toEqual(["panel_judge", "cheap_first"]);
    expect(chartable.every((s) => s.count > 0)).toBe(true);
  });
});
