import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BenchmarkTask,
  Evaluation,
  ExecutionResult,
  RunInput,
  RunResult,
  WorkflowKind
} from "@/lib/domain/types";
import { createConfiguredExecutor } from "@/lib/execution/provider";
import { createConfiguredProvider } from "@/lib/providers/provider";
import { runWorkflow } from "@/lib/workflows/runner";

type AppData = {
  runs: RunResult[];
  datasets: BenchmarkTask[];
};

export type DatasetRerunResult = {
  runs: RunResult[];
  failures: Array<{ workflow: WorkflowKind; error: string }>;
};

const DATA_DIR = process.env.ORCHESTRABENCH_DATA_DIR
  ? path.resolve(process.env.ORCHESTRABENCH_DATA_DIR)
  : path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "orchestrabench.json");
let mutationQueue: Promise<unknown> = Promise.resolve();

const DEFAULT_EXECUTION: ExecutionResult = {
  resolved: false,
  testsPassed: 0,
  testsTotal: 0,
  exitCode: null,
  timedOut: false,
  stdout: "",
  stderr: "",
  durationMs: 0,
  backend: "mock"
};

const DEFAULT_EVALUATION: Evaluation = {
  resolved: false,
  testsPassed: 0,
  testsTotal: 0,
  valueScore: 0
};

export function normalizeRun(run: RunResult): RunResult {
  // Spread defaults first so a wholly-missing or partially-missing nested
  // object (legacy runs) still has every field the UI reads.
  const execution: ExecutionResult = { ...DEFAULT_EXECUTION, ...run.execution };
  const evaluation: Evaluation = run.evaluation
    ? { ...DEFAULT_EVALUATION, ...run.evaluation }
    : {
        resolved: execution.resolved,
        testsPassed: execution.testsPassed,
        testsTotal: execution.testsTotal,
        valueScore: 0
      };

  return {
    ...run,
    execution,
    evaluation,
    candidateCode: run.candidateCode ?? "",
    finalAnswer: run.finalAnswer ?? "",
    calls: Array.isArray(run.calls) ? run.calls : [],
    costUsd: run.costUsd ?? 0,
    latencyMs: run.latencyMs ?? 0
  };
}

export async function listRuns(): Promise<RunResult[]> {
  const data = await readData();
  return [...data.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getRun(id: string): Promise<RunResult | undefined> {
  const data = await readData();
  return data.runs.find((run) => run.id === id);
}

export type RunBatchFields = Pick<RunResult, "batchId" | "batchIndex" | "batchTotal">;

export async function createRun(input: RunInput, batchFields?: RunBatchFields): Promise<RunResult> {
  const provider = createConfiguredProvider();
  const executor = createConfiguredExecutor();
  const resolved = await resolveRunInput(input);
  const result = await runWorkflow({ input: resolved, provider, executor });
  return saveRun(result, batchFields);
}

export async function resolveRunInput(input: RunInput): Promise<RunInput> {
  if (!input.benchmarkTaskId) {
    return input;
  }
  const task = await getDataset(input.benchmarkTaskId);
  if (!task) {
    return input;
  }
  return {
    ...input,
    code: input.code || task.code,
    testCode: input.testCode ?? task.testCode,
    entryPoint: input.entryPoint ?? task.entryPoint
  };
}

export async function saveRun(result: RunResult, batchFields?: RunBatchFields): Promise<RunResult> {
  const toSave: RunResult = batchFields ? { ...result, ...batchFields } : result;
  await mutateData((data) => {
    data.runs.unshift(toSave);
  });
  return toSave;
}

export async function updateRunEvaluation(
  id: string,
  patch: Pick<Evaluation, "userRating" | "notes">
): Promise<RunResult | undefined> {
  return mutateData((data) => {
    const run = data.runs.find((item) => item.id === id);
    if (!run) {
      return undefined;
    }

    run.evaluation = {
      ...run.evaluation,
      userRating: patch.userRating,
      notes: patch.notes
    };
    return run;
  });
}

export async function listDatasets(): Promise<BenchmarkTask[]> {
  const data = await readData();
  return [...data.datasets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDataset(id: string): Promise<BenchmarkTask | undefined> {
  const data = await readData();
  return data.datasets.find((task) => task.id === id);
}

export async function createDatasetTask(input: {
  title: string;
  language: string;
  prompt: string;
  code: string;
  knownBugTitle?: string;
  knownBugDescription?: string;
  knownBugSeverity?: "low" | "medium" | "high" | "critical";
  tags?: string[];
}): Promise<BenchmarkTask> {
  const now = new Date().toISOString();
  const task: BenchmarkTask = {
    id: makeId("task"),
    title: input.title,
    language: input.language,
    prompt: input.prompt,
    code: input.code,
    source: "manual",
    testCode: "",
    knownBugs:
      input.knownBugTitle && input.knownBugDescription
        ? [
            {
              id: makeId("bug"),
              title: input.knownBugTitle,
              description: input.knownBugDescription,
              severity: input.knownBugSeverity ?? "medium"
            }
          ]
        : [],
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now
  };
  await mutateData((data) => {
    data.datasets.unshift(task);
  });
  return task;
}

export async function upsertBenchmarkTask(task: BenchmarkTask): Promise<BenchmarkTask> {
  const now = new Date().toISOString();
  return mutateData((data) => {
    const stamped: BenchmarkTask = {
      ...task,
      createdAt: task.createdAt === "1970-01-01T00:00:00.000Z" ? now : task.createdAt,
      updatedAt: now
    };
    const index = data.datasets.findIndex((item) => item.id === task.id);
    if (index >= 0) {
      data.datasets[index] = stamped;
    } else {
      data.datasets.unshift(stamped);
    }
    return stamped;
  });
}

export async function rerunDatasetTask(
  taskId: string,
  workflows: WorkflowKind[],
  costLimitUsd?: number
): Promise<DatasetRerunResult> {
  const task = await getDataset(taskId);
  if (!task) {
    throw new Error("Dataset task not found.");
  }

  const results: RunResult[] = [];
  const failures: DatasetRerunResult["failures"] = [];
  for (const workflow of workflows) {
    try {
      results.push(
        await createRun({
          title: task.title,
          language: task.language,
          prompt: task.prompt,
          code: task.code,
          testCode: task.testCode,
          entryPoint: task.entryPoint,
          benchmarkTaskId: task.id,
          workflow,
          costLimitUsd
        })
      );
    } catch (error) {
      failures.push({
        workflow,
        error: error instanceof Error ? error.message : "Unknown rerun failure."
      });
    }
  }

  return { runs: results, failures };
}

export async function exportData(): Promise<AppData> {
  return readData();
}

async function readData(): Promise<AppData> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isAppData(parsed)) {
      return {
        runs: parsed.runs.map(normalizeRun),
        datasets: parsed.datasets
      };
    }
    throw new Error("Stored OrchestraBench data has an invalid shape.");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    const seeded = seedData();
    await writeData(seeded);
    return seeded;
  }
}

async function writeData(data: AppData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempFile, JSON.stringify(data, null, 2), "utf8");
  try {
    await renameWithRetry(tempFile, DATA_FILE);
  } catch (error) {
    await unlink(tempFile).catch(() => undefined);
    throw error;
  }
}

const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY", "EEXIST"]);

/**
 * Retries the temp-file rename on transient Windows contention (a reader briefly
 * holding the target → EPERM/EACCES/EBUSY/EEXIST). This prevents a crash under
 * concurrent access; it does NOT provide multi-writer consistency — concurrent
 * processes can still lose each other's updates (last write wins), since the
 * read-modify-write is only serialized in-process via `mutationQueue`.
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  let lastError: NodeJS.ErrnoException | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (!isNodeError(error) || !RETRYABLE_RENAME_CODES.has(error.code ?? "")) {
        throw error;
      }
      lastError = error;
      await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mutateData<T>(mutate: (data: AppData) => T): Promise<T> {
  const nextMutation = mutationQueue.then(async () => {
    const data = await readData();
    const result = mutate(data);
    await writeData(data);
    return result;
  });
  mutationQueue = nextMutation.catch(() => undefined);
  return nextMutation;
}

function isAppData(value: unknown): value is AppData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as AppData).runs) &&
    Array.isArray((value as AppData).datasets)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function seedData(): AppData {
  return { runs: [], datasets: [] };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
