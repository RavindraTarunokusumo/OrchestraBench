import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BenchmarkTask, Evaluation, RunInput, RunResult, WorkflowKind } from "@/lib/domain/types";
import { createConfiguredProvider } from "@/lib/providers/provider";
import { runWorkflow } from "@/lib/workflows/runner";

type AppData = {
  runs: RunResult[];
  datasets: BenchmarkTask[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "orchestrabench.json");

export async function listRuns(): Promise<RunResult[]> {
  const data = await readData();
  return [...data.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getRun(id: string): Promise<RunResult | undefined> {
  const data = await readData();
  return data.runs.find((run) => run.id === id);
}

export async function createRun(input: RunInput): Promise<RunResult> {
  const provider = createConfiguredProvider();
  const result = await runWorkflow({ input, provider });
  const data = await readData();
  data.runs.unshift(result);
  await writeData(data);
  return result;
}

export async function updateRunEvaluation(
  id: string,
  patch: Pick<Evaluation, "userRating" | "notes">
): Promise<RunResult | undefined> {
  const data = await readData();
  const run = data.runs.find((item) => item.id === id);
  if (!run) {
    return undefined;
  }

  run.evaluation = {
    ...run.evaluation,
    userRating: patch.userRating,
    notes: patch.notes
  };
  await writeData(data);
  return run;
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
  const data = await readData();
  data.datasets.unshift(task);
  await writeData(data);
  return task;
}

export async function rerunDatasetTask(
  taskId: string,
  workflows: WorkflowKind[],
  costLimitUsd?: number
): Promise<RunResult[]> {
  const task = await getDataset(taskId);
  if (!task) {
    throw new Error("Dataset task not found.");
  }

  const results: RunResult[] = [];
  for (const workflow of workflows) {
    results.push(
      await createRun({
        title: task.title,
        language: task.language,
        prompt: task.prompt,
        code: task.code,
        knownBugs: task.knownBugs,
        benchmarkTaskId: task.id,
        workflow,
        costLimitUsd
      })
    );
  }

  return results;
}

export async function exportData(): Promise<AppData> {
  return readData();
}

async function readData(): Promise<AppData> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as AppData;
  } catch {
    const seeded = seedData();
    await writeData(seeded);
    return seeded;
  }
}

async function writeData(data: AppData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function seedData(): AppData {
  const now = new Date().toISOString();
  return {
    runs: [],
    datasets: [
      {
        id: "seed_nullable_auth",
        title: "Nullable auth helper",
        language: "TypeScript",
        prompt: "Find correctness and security bugs in this authorization helper.",
        code: "export function canDelete(user?: { role: string }) {\n  return user!.role === 'admin';\n}",
        knownBugs: [
          {
            id: "bug_nullable_user",
            title: "Throws when user is missing",
            description: "The non-null assertion allows a runtime crash before authorization completes.",
            severity: "high",
            line: 2
          }
        ],
        tags: ["auth", "typescript", "seed"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "seed_python_truthy",
        title: "Python payment validation",
        language: "Python",
        prompt: "Review this payment validation function for logic bugs.",
        code: "def can_refund(amount, approved):\n    if approved or amount > 0:\n        return True\n    return False\n",
        knownBugs: [
          {
            id: "bug_refund_or",
            title: "Refund allowed without approval",
            description: "The condition uses OR, allowing positive refunds even when approval is false.",
            severity: "critical",
            line: 2
          }
        ],
        tags: ["payments", "python", "seed"],
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
