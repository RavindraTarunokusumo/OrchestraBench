import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/benchmarks/[slug]/stream/route";
import type { BatchEvent } from "@/lib/benchmarks/batch-events";
import { runBenchmarkBatch } from "@/lib/benchmarks/run-batch";
import type { BenchmarkTask } from "@/lib/domain/types";
import { createMockExecutor } from "@/lib/execution/mock-executor";
import { createMockProvider } from "@/lib/providers/mock-provider";
import * as fileStore from "@/lib/store/file-store";
import { getRun, listRuns, upsertBenchmarkTask } from "@/lib/store/file-store";
import * as runner from "@/lib/workflows/runner";

function task(
  partial: Partial<BenchmarkTask> & Pick<BenchmarkTask, "id" | "source" | "title">,
): BenchmarkTask {
  return {
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

async function seedQuixbugsTasks() {
  await upsertBenchmarkTask(
    task({ id: "qb-gcd", source: "quixbugs", title: "gcd", testCode: "assert gcd(4, 2) == 2", entryPoint: "gcd" }),
  );
  await upsertBenchmarkTask(
    task({
      id: "qb-bitcount",
      source: "quixbugs",
      title: "bitcount",
      testCode: "assert bitcount(7) == 3",
      entryPoint: "bitcount",
    }),
  );
  await upsertBenchmarkTask(
    task({ id: "qb-skip", source: "quixbugs", title: "no-tests", testCode: "" }),
  );
}

function parseBatchEvents(text: string): BatchEvent[] {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)) as BatchEvent);
}

describe("runBenchmarkBatch", () => {
  beforeEach(async () => {
    const dataDir = process.env.ORCHESTRABENCH_DATA_DIR!;
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "orchestrabench.json"),
      JSON.stringify({ runs: [], datasets: [] }),
      "utf8",
    );
  });

  it("runs runnable tasks sequentially, stamps batch metadata, and emits batch events", async () => {
    await seedQuixbugsTasks();

    const events: BatchEvent[] = [];
    const runWorkflowSpy = vi.spyOn(runner, "runWorkflow");

    const result = await runBenchmarkBatch(
      "quixbugs",
      { workflow: "single_cheap" },
      {
        provider: createMockProvider(),
        executor: createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 }),
        onEvent: (event) => events.push(event),
      },
    );

    expect(runWorkflowSpy.mock.calls.every((call) => call[0].onEvent === undefined)).toBe(true);
    runWorkflowSpy.mockRestore();

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.runIds).toHaveLength(2);
    expect(result.aggregateResolvedRate).toBe(1);

    expect(events[0]?.type).toBe("benchmark-start");
    if (events[0]?.type === "benchmark-start") {
      expect(events[0].slug).toBe("quixbugs");
      expect(events[0].name).toBe("QuixBugs");
      expect(events[0].taskTotal).toBe(2);
      expect(events[0].workflow).toBe("single_cheap");
    }

    const starts = events.filter((event) => event.type === "task-start");
    const finals = events.filter((event) => event.type === "task-final");
    expect(starts).toHaveLength(2);
    expect(finals).toHaveLength(2);
    expect(events.at(-1)?.type).toBe("benchmark-final");

    const savedRuns = (await listRuns()).filter((run) => run.batchId === result.batchId);
    expect(savedRuns).toHaveLength(2);
    expect(savedRuns.every((run) => run.batchTotal === 2)).toBe(true);
    expect(savedRuns.map((run) => run.batchIndex).sort()).toEqual([0, 1]);
    expect(savedRuns.every((run) => run.batchId === result.batchId)).toBe(true);

    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).not.toContain("step-start");
    expect(eventTypes).not.toContain("run-init");
  });

  it("excludes tasks without testCode from the batch", async () => {
    await seedQuixbugsTasks();

    const events: BatchEvent[] = [];
    await runBenchmarkBatch(
      "quixbugs",
      { workflow: "single_cheap" },
      {
        provider: createMockProvider(),
        executor: createMockExecutor({ resolved: false, testsPassed: 0, testsTotal: 1 }),
        onEvent: (event) => events.push(event),
      },
    );

    const start = events.find((event) => event.type === "benchmark-start");
    expect(start?.type === "benchmark-start" && start.taskTotal).toBe(2);

    const taskIds = events
      .filter((event) => event.type === "task-start")
      .map((event) => (event.type === "task-start" ? event.taskId : ""));
    expect(taskIds).not.toContain("qb-skip");
  });

  it("emits task-error and continues when persistence fails for one task", async () => {
    await seedQuixbugsTasks();

    const events: BatchEvent[] = [];
    const originalSaveRun = fileStore.saveRun;
    const saveRunSpy = vi
      .spyOn(fileStore, "saveRun")
      .mockImplementationOnce((result, batchFields) => originalSaveRun(result, batchFields))
      .mockImplementationOnce(() => {
        throw new Error("persist failed");
      })
      .mockImplementation((result, batchFields) => originalSaveRun(result, batchFields));

    const result = await runBenchmarkBatch(
      "quixbugs",
      { workflow: "single_cheap" },
      {
        provider: createMockProvider(),
        executor: createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 }),
        onEvent: (event) => events.push(event),
      },
    );

    saveRunSpy.mockRestore();

    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1);
    expect(events.some((event) => event.type === "task-error")).toBe(true);
    const finalEvent = events.at(-1);
    expect(finalEvent?.type).toBe("benchmark-final");
    if (finalEvent?.type === "benchmark-final") {
      expect(finalEvent.completed).toBe(1);
      expect(finalEvent.failed).toBe(1);
    }
  });

  it("throws when the benchmark slug is unknown", async () => {
    await expect(
      runBenchmarkBatch(
        "unknown",
        { workflow: "single_cheap" },
        {
          provider: createMockProvider(),
          executor: createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 }),
        },
      ),
    ).rejects.toThrow("Benchmark not found");
  });

  it("persists batch fields via saveRun for each completed task", async () => {
    await upsertBenchmarkTask(
      task({ id: "custom-one", source: "manual", title: "one", testCode: "assert True" }),
    );

    const { runIds, batchId } = await runBenchmarkBatch(
      "custom",
      { workflow: "single_cheap" },
      {
        provider: createMockProvider(),
        executor: createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 }),
      },
    );

    const saved = await getRun(runIds[0]!);
    expect(saved?.batchId).toBe(batchId);
    expect(saved?.batchIndex).toBe(0);
    expect(saved?.batchTotal).toBe(1);
  });
});

describe("POST /api/benchmarks/[slug]/stream", () => {
  beforeEach(async () => {
    const dataDir = process.env.ORCHESTRABENCH_DATA_DIR!;
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "orchestrabench.json"),
      JSON.stringify({ runs: [], datasets: [] }),
      "utf8",
    );
  });

  it("streams benchmark batch events in order for a valid request", async () => {
    await seedQuixbugsTasks();

    const request = new Request("http://localhost/api/benchmarks/quixbugs/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: "single_cheap" }),
    });

    const response = await POST(request, { params: Promise.resolve({ slug: "quixbugs" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const events = parseBatchEvents(await response.text());
    expect(events[0]?.type).toBe("benchmark-start");
    expect(events.at(-1)?.type).toBe("benchmark-final");
    expect(events.some((event) => event.type === "task-final")).toBe(true);
  });

  it("returns 404 for an unknown benchmark slug", async () => {
    const request = new Request("http://localhost/api/benchmarks/missing/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: "single_cheap" }),
    });

    const response = await POST(request, { params: Promise.resolve({ slug: "missing" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 without opening a stream when the body is invalid", async () => {
    await seedQuixbugsTasks();

    const request = new Request("http://localhost/api/benchmarks/quixbugs/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: "not_a_workflow" }),
    });

    const response = await POST(request, { params: Promise.resolve({ slug: "quixbugs" }) });
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).not.toBe("text/event-stream");
  });
});
