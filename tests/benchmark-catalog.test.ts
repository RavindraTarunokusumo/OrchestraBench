import { describe, expect, it } from "vitest";
import type { BenchmarkTask, RunResult } from "@/lib/domain/types";
import {
  benchmarkNameForSource,
  benchmarkSlugForSource,
  getBenchmark,
  listBenchmarks,
  tasksForBenchmark,
} from "@/lib/benchmarks/catalog";

function task(
  partial: Partial<BenchmarkTask> & Pick<BenchmarkTask, "id" | "source">,
): BenchmarkTask {
  return {
    title: partial.title ?? partial.id,
    language: partial.language ?? "python",
    prompt: partial.prompt ?? "Fix the bug.",
    code: partial.code ?? "def f(): pass",
    testCode: partial.testCode ?? "assert True",
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? "1970-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "1970-01-01T00:00:00.000Z",
    ...partial,
  };
}

function run(partial: {
  benchmarkTaskId?: string;
  resolved?: boolean;
}): RunResult {
  return {
    benchmarkTaskId: partial.benchmarkTaskId,
    evaluation: {
      resolved: partial.resolved ?? false,
      valueScore: 0,
      testsPassed: 0,
      testsTotal: 0,
    },
  } as RunResult;
}

describe("benchmarkSlugForSource and benchmarkNameForSource", () => {
  it("maps quixbugs to slug quixbugs and name QuixBugs", () => {
    expect(benchmarkSlugForSource("quixbugs")).toBe("quixbugs");
    expect(benchmarkNameForSource("quixbugs")).toBe("QuixBugs");
  });

  it("maps manual to slug custom and name Custom", () => {
    expect(benchmarkSlugForSource("manual")).toBe("custom");
    expect(benchmarkNameForSource("manual")).toBe("Custom");
  });
});

describe("tasksForBenchmark", () => {
  const tasks = [
    task({ id: "qb-1", source: "quixbugs", title: "gcd" }),
    task({ id: "qb-2", source: "quixbugs", title: "bitcount" }),
    task({ id: "custom-1", source: "manual", title: "my bug" }),
  ];

  it("returns quixbugs tasks for slug quixbugs", () => {
    expect(tasksForBenchmark("quixbugs", tasks).map((t) => t.id)).toEqual(["qb-1", "qb-2"]);
  });

  it("returns manual tasks for slug custom", () => {
    expect(tasksForBenchmark("custom", tasks).map((t) => t.id)).toEqual(["custom-1"]);
  });

  it("returns an empty array for an unknown slug", () => {
    expect(tasksForBenchmark("unknown", tasks)).toEqual([]);
  });
});

describe("listBenchmarks", () => {
  it("returns an empty array when there are no tasks", () => {
    expect(listBenchmarks([], [])).toEqual([]);
  });

  it("groups tasks by source with stable ordering (quixbugs before custom)", () => {
    const tasks = [
      task({ id: "custom-1", source: "manual" }),
      task({ id: "qb-1", source: "quixbugs" }),
      task({ id: "qb-2", source: "quixbugs" }),
    ];

    const benchmarks = listBenchmarks(tasks, []);

    expect(benchmarks.map((b) => b.slug)).toEqual(["quixbugs", "custom"]);
    expect(benchmarks[0]).toMatchObject({
      slug: "quixbugs",
      name: "QuixBugs",
      source: "quixbugs",
      taskCount: 2,
      resolvedRate: 0,
    });
    expect(benchmarks[1]).toMatchObject({
      slug: "custom",
      name: "Custom",
      source: "manual",
      taskCount: 1,
      resolvedRate: 0,
    });
  });

  it("computes resolvedRate from runs linked to tasks in each benchmark", () => {
    const tasks = [
      task({ id: "qb-1", source: "quixbugs" }),
      task({ id: "qb-2", source: "quixbugs" }),
      task({ id: "custom-1", source: "manual" }),
    ];
    const runs = [
      run({ benchmarkTaskId: "qb-1", resolved: true }),
      run({ benchmarkTaskId: "qb-2", resolved: false }),
      run({ benchmarkTaskId: "custom-1", resolved: true }),
      run({ benchmarkTaskId: "custom-1", resolved: true }),
      run({ benchmarkTaskId: "other-task", resolved: true }),
      run({ resolved: true }),
    ];

    const benchmarks = listBenchmarks(tasks, runs);

    expect(benchmarks[0]?.resolvedRate).toBe(0.5);
    expect(benchmarks[1]?.resolvedRate).toBe(1);
  });

  it("omits benchmarks with no tasks for that source", () => {
    const tasks = [task({ id: "qb-1", source: "quixbugs" })];

    expect(listBenchmarks(tasks, []).map((b) => b.slug)).toEqual(["quixbugs"]);
  });
});

describe("getBenchmark", () => {
  const tasks = [
    task({ id: "qb-1", source: "quixbugs" }),
    task({ id: "custom-1", source: "manual" }),
  ];

  it("returns a benchmark for a known slug", () => {
    const runs = [
      run({ benchmarkTaskId: "qb-1", resolved: true }),
      run({ benchmarkTaskId: "qb-1", resolved: false }),
    ];

    expect(getBenchmark("quixbugs", tasks, runs)).toEqual({
      slug: "quixbugs",
      name: "QuixBugs",
      source: "quixbugs",
      taskCount: 1,
      resolvedRate: 0.5,
    });
  });

  it("returns undefined for an unknown slug", () => {
    expect(getBenchmark("unknown", tasks, [])).toBeUndefined();
  });

  it("returns undefined when no tasks exist for the slug source", () => {
    const quixbugsOnly = [task({ id: "qb-1", source: "quixbugs" })];

    expect(getBenchmark("custom", quixbugsOnly, [])).toBeUndefined();
  });
});
