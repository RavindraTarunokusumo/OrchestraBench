# Benchmark Ingestion + Code-Repair Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose OrchestraBench from prose code-review scoring to code-repair benchmarking — workflows emit a fix, the fix runs against a real benchmark's tests in a sandbox, and runs are scored on tests passed.

**Architecture:** A pluggable `BenchmarkAdapter` (first impl: QuixBugs) ingests external benchmark tasks into the store. The runner emits corrected code, a pure extractor pulls the candidate, and a `SandboxExecutor` port (E2B impl + mock impl) runs it against the task's test. Execution results replace the finding/TP-FP evaluation.

**Tech Stack:** Next.js 15 / React 19, TypeScript, Vitest, Zod, `@e2b/code-interpreter`, file-based JSON store.

## Global Constraints

- Test runner: Vitest. Full suite: `npm test` (`vitest run`). Single file: `npx vitest run <path>`. Single test: `npx vitest run <path> -t "<name>"`.
- `vitest.config` runs with `fileParallelism: false` (Windows EPERM workaround) — do not change.
- TypeScript path alias: `@/` → repo root. Import internal modules as `@/lib/...`.
- Pre-commit gate every task: `npm run lint && npm run typecheck && npm test` must pass on touched files. Pre-existing failures in untouched files are noted, not fixed.
- Specific staging only (`git add <paths>`), never `git add -A`. One deliverable per commit. Attach a git note per `.github/git_notes_template.md` after each commit.
- No network in unit/integration tests — use `MockSandboxExecutor` and the mock provider. The real E2B test is opt-in, gated on `E2B_API_KEY`, skipped otherwise.
- Sandbox backend value is `"e2b"` or `"mock"` (exact strings).
- `referenceFix` is the answer key — never include it in any prompt sent to a provider.

---

### Task 1: Domain types + Zod contracts

**Files:**
- Modify: `lib/domain/types.ts`
- Modify: `lib/api/contracts.ts`
- Test: `tests/api-contracts.test.ts`

**Interfaces:**
- Produces: `ExecutionResult`, extended `BenchmarkTask` (`testCode`, `referenceFix?`, `entryPoint?`, `source`), repurposed `Evaluation` (`resolved`, `testsPassed`, `testsTotal`, `valueScore`, optional `judgeConfidence`/`userRating`/`notes`), `RunResult` (`candidateCode`, `execution`, no `findings`), `RunInput` (`testCode?`, `entryPoint?`). `createRunSchema` accepts `testCode`/`entryPoint`.

- [ ] **Step 1: Write the failing test**

Add to `tests/api-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRunCreateRequest } from "@/lib/api/contracts";

describe("createRunSchema repair fields", () => {
  it("accepts testCode and entryPoint", () => {
    const input = parseRunCreateRequest({
      title: "gcd",
      language: "python",
      prompt: "Fix the bug.",
      code: "def gcd(a, b): return a",
      workflow: "single_cheap",
      testCode: "assert gcd(4, 2) == 2",
      entryPoint: "gcd"
    });
    expect(input.testCode).toBe("assert gcd(4, 2) == 2");
    expect(input.entryPoint).toBe("gcd");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api-contracts.test.ts -t "accepts testCode and entryPoint"`
Expected: FAIL (`testCode` stripped / type error — field not in schema).

- [ ] **Step 3: Update the types**

In `lib/domain/types.ts`, add and change:

```ts
export type ExecutionResult = {
  resolved: boolean;
  testsPassed: number;
  testsTotal: number;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  backend: "e2b" | "mock";
};

export type Evaluation = {
  resolved: boolean;
  testsPassed: number;
  testsTotal: number;
  valueScore: number;
  judgeConfidence?: number;
  userRating?: number;
  notes?: string;
};
```

Extend `BenchmarkTask`:

```ts
export type BenchmarkTask = {
  id: string;
  title: string;
  language: string;
  prompt: string;
  code: string;            // buggy code
  testCode: string;
  referenceFix?: string;
  entryPoint?: string;
  source: "manual" | "quixbugs";
  knownBugs?: KnownBug[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
```

Change `RunInput` (drop required `knownBugs`, add repair fields):

```ts
export type RunInput = {
  title: string;
  language: string;
  prompt: string;
  code: string;
  workflow: WorkflowKind;
  costLimitUsd?: number;
  benchmarkTaskId?: string;
  testCode?: string;
  entryPoint?: string;
};
```

Change `RunResult`: remove `findings: Finding[]`; add `candidateCode: string;` and `execution: ExecutionResult;`. Remove the now-unused `Finding` type and its `truthState` union. Leave `KnownBug` in place (still referenced by manual tasks).

- [ ] **Step 4: Update the Zod contracts**

In `lib/api/contracts.ts`, add to `createRunSchema`:

```ts
  testCode: z.string().trim().min(1).optional(),
  entryPoint: z.string().trim().min(1).optional(),
```

Remove the `knownBugs` field from `createRunSchema` (review answer keys no longer flow through run creation). Leave `createDatasetSchema` as-is for now (manual review tasks remain creatable; ingestion writes tasks directly, Task 4).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/api-contracts.test.ts -t "accepts testCode and entryPoint"`
Expected: PASS. (Other files will not yet compile — that is resolved in later tasks; run typecheck at the end of Task 7.)

- [ ] **Step 6: Commit**

```bash
git add lib/domain/types.ts lib/api/contracts.ts tests/api-contracts.test.ts
git commit -m "feat(types): add execution-result and repair-mode run/task shapes"
```

---

### Task 2: Code extractor

**Files:**
- Create: `lib/workflows/extract-code.ts`
- Test: `tests/extract-code.test.ts`

**Interfaces:**
- Produces: `extractCode(answer: string): string` — returns the candidate fix.

- [ ] **Step 1: Write the failing test**

Create `tests/extract-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractCode } from "@/lib/workflows/extract-code";

describe("extractCode", () => {
  it("prefers a fenced python block", () => {
    const answer = "Here is the fix:\n```python\ndef gcd(a, b):\n    return b\n```\nDone.";
    expect(extractCode(answer)).toBe("def gcd(a, b):\n    return b");
  });

  it("falls back to a generic fenced block", () => {
    const answer = "```\nx = 1\n```";
    expect(extractCode(answer)).toBe("x = 1");
  });

  it("returns the trimmed whole answer when no fence is present", () => {
    expect(extractCode("  def f():\n    return 1  ")).toBe("def f():\n    return 1");
  });

  it("picks the largest block when multiple are present", () => {
    const answer = "```python\nx=1\n```\nthen\n```python\ndef big():\n    return 2\n```";
    expect(extractCode(answer)).toBe("def big():\n    return 2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/extract-code.test.ts`
Expected: FAIL ("Cannot find module '@/lib/workflows/extract-code'").

- [ ] **Step 3: Implement the extractor**

Create `lib/workflows/extract-code.ts`:

```ts
const FENCE = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;

/** Pull the candidate code from a model answer: largest fenced block, else the trimmed answer. */
export function extractCode(answer: string): string {
  const blocks: string[] = [];
  for (const match of answer.matchAll(FENCE)) {
    blocks.push(match[1].replace(/\n$/, ""));
  }
  if (blocks.length > 0) {
    return blocks.reduce((best, block) => (block.length > best.length ? block : best)).trim();
  }
  return answer.trim();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/extract-code.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/workflows/extract-code.ts tests/extract-code.test.ts
git commit -m "feat(workflows): add candidate-code extractor"
```

---

### Task 3: SandboxExecutor port + MockSandboxExecutor

**Files:**
- Create: `lib/execution/executor.ts`
- Create: `lib/execution/mock-executor.ts`
- Test: `tests/mock-executor.test.ts`

**Interfaces:**
- Produces: `SandboxExecutor` interface with `run(args: ExecutorArgs): Promise<ExecutionResult>`; `ExecutorArgs = { language: string; candidateCode: string; testCode: string; entryPoint?: string; timeoutMs: number }`. `createMockExecutor(script: Partial<ExecutionResult>): SandboxExecutor` — returns a fixed result merged over defaults.

- [ ] **Step 1: Write the failing test**

Create `tests/mock-executor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMockExecutor } from "@/lib/execution/mock-executor";

describe("createMockExecutor", () => {
  it("returns the scripted result", async () => {
    const executor = createMockExecutor({ resolved: true, testsPassed: 3, testsTotal: 3 });
    const result = await executor.run({
      language: "python",
      candidateCode: "def f(): return 1",
      testCode: "assert f() == 1",
      timeoutMs: 1000
    });
    expect(result.resolved).toBe(true);
    expect(result.testsPassed).toBe(3);
    expect(result.backend).toBe("mock");
  });

  it("defaults to an unresolved zero-test result", async () => {
    const executor = createMockExecutor({});
    const result = await executor.run({
      language: "python",
      candidateCode: "",
      testCode: "",
      timeoutMs: 1000
    });
    expect(result.resolved).toBe(false);
    expect(result.testsTotal).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mock-executor.test.ts`
Expected: FAIL ("Cannot find module '@/lib/execution/mock-executor'").

- [ ] **Step 3: Implement the port and the mock**

Create `lib/execution/executor.ts`:

```ts
import type { ExecutionResult } from "@/lib/domain/types";

export type ExecutorArgs = {
  language: string;
  candidateCode: string;
  testCode: string;
  entryPoint?: string;
  timeoutMs: number;
};

export interface SandboxExecutor {
  run(args: ExecutorArgs): Promise<ExecutionResult>;
}
```

Create `lib/execution/mock-executor.ts`:

```ts
import type { ExecutionResult } from "@/lib/domain/types";
import type { SandboxExecutor } from "@/lib/execution/executor";

const DEFAULT_RESULT: ExecutionResult = {
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

export function createMockExecutor(script: Partial<ExecutionResult>): SandboxExecutor {
  return {
    run: async () => ({ ...DEFAULT_RESULT, ...script, backend: "mock" })
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/mock-executor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/execution/executor.ts lib/execution/mock-executor.ts tests/mock-executor.test.ts
git commit -m "feat(execution): add SandboxExecutor port and mock executor"
```

---

### Task 4: QuixBugs adapter + ingest script

**Files:**
- Create: `lib/benchmarks/adapter.ts`
- Create: `lib/benchmarks/quixbugs.ts`
- Create: `scripts/ingest-benchmark.ts`
- Modify: `lib/store/file-store.ts` (add `upsertBenchmarkTask`, update `seedData` to empty datasets, update `isAppData` if it validates shape)
- Modify: `.gitignore` (add `.benchmarks/`)
- Test: `tests/quixbugs-adapter.test.ts`
- Fixture: `tests/fixtures/quixbugs/python_programs/gcd.py`, `tests/fixtures/quixbugs/correct_python_programs/gcd.py`, `tests/fixtures/quixbugs/json_testcases/gcd.json`

**Interfaces:**
- Consumes: extended `BenchmarkTask` (Task 1).
- Produces: `BenchmarkAdapter { source: string; ingest(rawDir: string): Promise<BenchmarkTask[]> }`; `quixbugsAdapter: BenchmarkAdapter`; `upsertBenchmarkTask(task: BenchmarkTask): Promise<BenchmarkTask>` in the store (replaces by `id`).

- [ ] **Step 1: Create the fixture**

`tests/fixtures/quixbugs/python_programs/gcd.py`:

```python
def gcd(a, b):
    if b == 0:
        return a
    else:
        return gcd(a % b, b)
```

`tests/fixtures/quixbugs/correct_python_programs/gcd.py`:

```python
def gcd(a, b):
    if b == 0:
        return a
    else:
        return gcd(b, a % b)
```

`tests/fixtures/quixbugs/json_testcases/gcd.json` (one JSON object per line, QuixBugs format — `[inputs, expected]`):

```
[[35, 21], 7]
[[7, 49], 7]
```

- [ ] **Step 2: Write the failing test**

Create `tests/quixbugs-adapter.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { quixbugsAdapter } from "@/lib/benchmarks/quixbugs";

const RAW_DIR = path.join(process.cwd(), "tests", "fixtures", "quixbugs");

describe("quixbugsAdapter", () => {
  it("normalizes a program into a benchmark task", async () => {
    const tasks = await quixbugsAdapter.ingest(RAW_DIR);
    const gcd = tasks.find((task) => task.id === "quixbugs_gcd");
    expect(gcd).toBeDefined();
    expect(gcd?.source).toBe("quixbugs");
    expect(gcd?.language).toBe("python");
    expect(gcd?.entryPoint).toBe("gcd");
    expect(gcd?.code).toContain("gcd(a % b, b)");        // buggy
    expect(gcd?.referenceFix).toContain("gcd(b, a % b)"); // gold
    expect(gcd?.testCode).toContain("gcd(35, 21)");
    expect(gcd?.testCode).toContain("== 7");
  });

  it("is deterministic across runs", async () => {
    const first = await quixbugsAdapter.ingest(RAW_DIR);
    const second = await quixbugsAdapter.ingest(RAW_DIR);
    expect(first).toEqual(second);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/quixbugs-adapter.test.ts`
Expected: FAIL ("Cannot find module '@/lib/benchmarks/quixbugs'").

- [ ] **Step 4: Implement the adapter port and QuixBugs adapter**

Create `lib/benchmarks/adapter.ts`:

```ts
import type { BenchmarkTask } from "@/lib/domain/types";

export interface BenchmarkAdapter {
  source: string;
  ingest(rawDir: string): Promise<BenchmarkTask[]>;
}
```

Create `lib/benchmarks/quixbugs.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BenchmarkTask } from "@/lib/domain/types";
import type { BenchmarkAdapter } from "@/lib/benchmarks/adapter";

const PROMPT =
  "Fix the bug in this function so all tests pass. Return only the corrected code in a single code block.";
const EPOCH = "1970-01-01T00:00:00.000Z";

async function readProgram(dir: string, name: string): Promise<string> {
  return (await readFile(path.join(dir, name), "utf8")).trimEnd();
}

function buildTestCode(entryPoint: string, casesJsonl: string): string {
  const lines = casesJsonl
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const asserts = lines.map((line) => {
    const [inputs, expected] = JSON.parse(line) as [unknown[], unknown];
    const args = inputs.map((value) => JSON.stringify(value)).join(", ");
    return `assert ${entryPoint}(${args}) == ${JSON.stringify(expected)}`;
  });
  return asserts.join("\n");
}

export const quixbugsAdapter: BenchmarkAdapter = {
  source: "quixbugs",
  async ingest(rawDir: string): Promise<BenchmarkTask[]> {
    const buggyDir = path.join(rawDir, "python_programs");
    const correctDir = path.join(rawDir, "correct_python_programs");
    const casesDir = path.join(rawDir, "json_testcases");

    const files = (await readdir(buggyDir)).filter((file) => file.endsWith(".py")).sort();
    const tasks: BenchmarkTask[] = [];

    for (const file of files) {
      const name = file.replace(/\.py$/, "");
      let casesJsonl: string;
      try {
        casesJsonl = await readFile(path.join(casesDir, `${name}.json`), "utf8");
      } catch {
        continue; // skip programs without testcases
      }
      tasks.push({
        id: `quixbugs_${name}`,
        title: name,
        language: "python",
        prompt: PROMPT,
        code: await readProgram(buggyDir, file),
        referenceFix: await readProgram(correctDir, file),
        testCode: buildTestCode(name, casesJsonl),
        entryPoint: name,
        source: "quixbugs",
        tags: ["quixbugs", "python"],
        createdAt: EPOCH,
        updatedAt: EPOCH
      });
    }
    return tasks;
  }
};
```

(Using a fixed `EPOCH` for `createdAt`/`updatedAt` keeps `ingest` deterministic; the store stamps real times on upsert in Step 5.)

- [ ] **Step 5: Add `upsertBenchmarkTask` to the store**

In `lib/store/file-store.ts`, add (near `createDatasetTask`):

```ts
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
```

Change `seedData()` to return empty datasets:

```ts
function seedData(): AppData {
  return { runs: [], datasets: [] };
}
```

(`createDatasetTask` must also set `source: "manual"`, `testCode: ""`, and keep `knownBugs` — add those fields so the object satisfies the extended `BenchmarkTask`.)

- [ ] **Step 6: Write the ingest script**

Create `scripts/ingest-benchmark.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { quixbugsAdapter } from "@/lib/benchmarks/quixbugs";
import { upsertBenchmarkTask } from "@/lib/store/file-store";

const QUIXBUGS_REPO = "https://github.com/jkoppel/QuixBugs.git";
const QUIXBUGS_COMMIT = "a23e533a8b9019466e0e3220e2e3d4b9e4cf2e0d";
const RAW_DIR = path.join(process.cwd(), ".benchmarks", "quixbugs");
const SUBSET = [
  "gcd", "bitcount", "find_first_in_sorted", "hanoi", "is_valid_parenthesization",
  "levenshtein", "lis", "max_sublist_sum", "next_permutation", "shortest_path_length"
];

async function main() {
  const all = process.argv.includes("--all");
  if (!existsSync(RAW_DIR)) {
    execFileSync("git", ["clone", "--depth", "1", QUIXBUGS_REPO, RAW_DIR], { stdio: "inherit" });
    execFileSync("git", ["-C", RAW_DIR, "fetch", "--depth", "1", "origin", QUIXBUGS_COMMIT], { stdio: "inherit" });
    execFileSync("git", ["-C", RAW_DIR, "checkout", QUIXBUGS_COMMIT], { stdio: "inherit" });
  }

  const tasks = await quixbugsAdapter.ingest(RAW_DIR);
  const selected = all ? tasks : tasks.filter((task) => SUBSET.includes(task.title));
  for (const task of selected) {
    await upsertBenchmarkTask(task);
  }
  console.log(`Ingested ${selected.length} QuixBugs task(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add a script entry to `package.json` `scripts`: `"ingest:quixbugs": "tsx scripts/ingest-benchmark.ts"`. Add `tsx` to devDependencies: `npm install -D tsx`.

Add `.benchmarks/` to `.gitignore`.

- [ ] **Step 7: Run the adapter tests to verify they pass**

Run: `npx vitest run tests/quixbugs-adapter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add lib/benchmarks/adapter.ts lib/benchmarks/quixbugs.ts scripts/ingest-benchmark.ts lib/store/file-store.ts tests/quixbugs-adapter.test.ts tests/fixtures/quixbugs .gitignore package.json package-lock.json
git commit -m "feat(benchmarks): add QuixBugs adapter and ingest script"
```

---

### Task 5: Repair runner + execution scoring (mock executor end-to-end)

**Files:**
- Create: `lib/evaluation/score-execution.ts`
- Modify: `lib/evaluation/metrics.ts` (remove TP/FP scorer or re-export from score-execution)
- Modify: `lib/workflows/runner.ts`
- Modify: `lib/workflows/events.ts` (add `execution-result` event; change `run-final` payload)
- Modify: `lib/store/file-store.ts` (`createRun` injects executor; resolve `testCode`/`entryPoint` from benchmark task)
- Test: `tests/score-execution.test.ts`, `tests/runner-events.test.ts` (update), `tests/workflows.test.ts` (update)

**Interfaces:**
- Consumes: `extractCode` (Task 2), `SandboxExecutor` (Task 3), `ExecutionResult`/`Evaluation` (Task 1).
- Produces: `scoreExecution(execution: ExecutionResult, costUsd: number): Pick<Evaluation, "resolved" | "testsPassed" | "testsTotal" | "valueScore">`; `runWorkflow({ input, provider, executor, onEvent })` now requires `executor: SandboxExecutor`; `WorkflowEvent` gains `{ type: "execution-result"; result: ExecutionResult }`.

- [ ] **Step 1: Write the failing scorer test**

Create `tests/score-execution.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreExecution } from "@/lib/evaluation/score-execution";
import type { ExecutionResult } from "@/lib/domain/types";

function exec(partial: Partial<ExecutionResult>): ExecutionResult {
  return {
    resolved: false, testsPassed: 0, testsTotal: 0, exitCode: null,
    timedOut: false, stdout: "", stderr: "", durationMs: 0, backend: "mock", ...partial
  };
}

describe("scoreExecution", () => {
  it("scores a full resolve as value 1 per cost", () => {
    const score = scoreExecution(exec({ resolved: true, testsPassed: 2, testsTotal: 2 }), 0);
    expect(score.resolved).toBe(true);
    expect(score.valueScore).toBeCloseTo(1 / 0.0001, 5);
  });

  it("gives partial credit when some tests pass", () => {
    const score = scoreExecution(exec({ resolved: false, testsPassed: 1, testsTotal: 4 }), 0);
    expect(score.valueScore).toBeCloseTo(0.25 / 0.0001, 5);
  });

  it("scores zero tests as zero value", () => {
    const score = scoreExecution(exec({ testsTotal: 0 }), 0.5);
    expect(score.valueScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/score-execution.test.ts`
Expected: FAIL ("Cannot find module '@/lib/evaluation/score-execution'").

- [ ] **Step 3: Implement the scorer**

Create `lib/evaluation/score-execution.ts`:

```ts
import type { Evaluation, ExecutionResult } from "@/lib/domain/types";

const COST_FLOOR = 0.0001;

export function scoreExecution(
  execution: ExecutionResult,
  costUsd: number
): Pick<Evaluation, "resolved" | "testsPassed" | "testsTotal" | "valueScore"> {
  const fraction =
    execution.testsTotal > 0 ? execution.testsPassed / execution.testsTotal : 0;
  const credit = execution.resolved ? 1 : fraction;
  return {
    resolved: execution.resolved,
    testsPassed: execution.testsPassed,
    testsTotal: execution.testsTotal,
    valueScore: credit / Math.max(costUsd, COST_FLOOR)
  };
}
```

- [ ] **Step 4: Run the scorer test to verify it passes**

Run: `npx vitest run tests/score-execution.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update the workflow events**

In `lib/workflows/events.ts`: add to the union `| { type: "execution-result"; result: ExecutionResult }` (import `ExecutionResult`), and replace the `run-final` member's `findingsCount`/`qualityScore` fields with:

```ts
  | {
      type: "run-final";
      runId: string;
      status: RunStatus;
      costUsd: number;
      latencyMs: number;
      resolved: boolean;
      testsPassed: number;
      testsTotal: number;
      valueScore: number;
    }
```

- [ ] **Step 6: Rewrite the runner for repair**

In `lib/workflows/runner.ts`:
- Add `executor: SandboxExecutor` to `RunWorkflowArgs` and destructure it in `runWorkflow`.
- Change `buildReviewPrompt` to a repair prompt:

```ts
function buildRepairPrompt(input: RunInput, role: string): string {
  return [
    `Role: ${role}`,
    `Task: ${input.title}`,
    `Language: ${input.language}`,
    `Instructions: ${input.prompt}`,
    "Return only the corrected code in a single code block. Do not include explanations.",
    "Buggy code:",
    input.code
  ].join("\n");
}
```

Update every `buildReviewPrompt(...)` call site to `buildRepairPrompt(...)`. The planner/worker/verifier/judge intermediate prompts stay, but the final-stage prompt of each workflow must request corrected code (use `buildRepairPrompt` for the stage that sets `finalAnswer`).

- Replace the post-orchestration block (the `synthesizeFindings`/`evaluateRun` section, ~lines 151-178) with:

```ts
  const candidateCode = extractCode(finalAnswer);
  const costUsd = sumCost(state.calls);
  const execution = await executor.run({
    language: input.language,
    candidateCode,
    testCode: input.testCode ?? "",
    entryPoint: input.entryPoint,
    timeoutMs: 30_000
  });
  onEvent?.({ type: "execution-result", result: execution });

  const scored = scoreExecution(execution, costUsd);
  const evaluation: Evaluation = { ...scored, judgeConfidence: state.calls.some((c) => c.role === "judge") ? 0.84 : 0.72 };
  const latencyMs = state.calls.reduce((total, call) => total + call.latencyMs, 0);
  const completedAt = new Date();

  return {
    id: makeId("run"),
    workflow: input.workflow,
    status: execution.resolved ? "completed" : "partial",
    title: input.title,
    language: input.language,
    prompt: input.prompt,
    code: input.code,
    providerLabel: provider.label,
    finalAnswer,
    candidateCode,
    execution,
    calls: state.calls,
    evaluation,
    costUsd,
    latencyMs,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    escalated,
    escalationReason,
    benchmarkTaskId: input.benchmarkTaskId
  };
```

- Remove `synthesizeFindings`, `matchesKnownBug`, `normalizeForMatch`, `evaluateRun`, and the `Finding`/`computeEvaluationScores` imports. Add imports for `extractCode`, `scoreExecution`, `SandboxExecutor`, and `ExecutionResult`.
- Update `buildFailedRun` to return `candidateCode: ""` and a default failed `execution` (`{ resolved: false, testsPassed: 0, testsTotal: 0, exitCode: null, timedOut: false, stdout: "", stderr: "", durationMs: 0, backend: executor's backend is unknown here → "mock" }` — use `"mock"` as the inert default) and `evaluation` via `scoreExecution(defaultExecution, costUsd)`.
- Update `validateRunInput` to also require `input.testCode?.trim()` is present (throw `"Test code is required."` if empty).

- [ ] **Step 7: Inject the executor in the store**

In `lib/store/file-store.ts` `createRun`:

```ts
import { createConfiguredExecutor } from "@/lib/execution/provider";
// ...
export async function createRun(input: RunInput): Promise<RunResult> {
  const provider = createConfiguredProvider();
  const executor = createConfiguredExecutor();
  const resolved = await resolveRunInput(input);
  const result = await runWorkflow({ input: resolved, provider, executor });
  return saveRun(result);
}
```

Add a helper that fills `testCode`/`entryPoint` from the benchmark task when only `benchmarkTaskId` is given:

```ts
async function resolveRunInput(input: RunInput): Promise<RunInput> {
  if (input.testCode || !input.benchmarkTaskId) {
    return input;
  }
  const task = await getDataset(input.benchmarkTaskId);
  if (!task) {
    return input;
  }
  return { ...input, code: input.code || task.code, testCode: task.testCode, entryPoint: task.entryPoint };
}
```

In `rerunDatasetTask`, replace the `knownBugs: task.knownBugs` arg with `testCode: task.testCode, entryPoint: task.entryPoint` and keep `code: task.code`.

`createConfiguredExecutor` is created in Task 6 — for now add a temporary stub module `lib/execution/provider.ts` returning `createMockExecutor({})` so this task compiles and tests run; Task 6 replaces the body with the E2B selection.

```ts
// lib/execution/provider.ts (temporary; finalized in Task 6)
import { createMockExecutor } from "@/lib/execution/mock-executor";
import type { SandboxExecutor } from "@/lib/execution/executor";
export function createConfiguredExecutor(): SandboxExecutor {
  return createMockExecutor({});
}
```

- [ ] **Step 8: Update the runner-events and workflows tests**

Update `tests/runner-events.test.ts` and `tests/workflows.test.ts` to pass an `executor` (use `createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 })`) and `testCode` in the input, and assert on the new event/return shape. Example assertion to add in `tests/workflows.test.ts`:

```ts
import { createMockExecutor } from "@/lib/execution/mock-executor";

it("returns a resolved repair run", async () => {
  const result = await runWorkflow({
    input: {
      title: "gcd", language: "python", prompt: "Fix it.",
      code: "def gcd(a,b): return a", workflow: "single_cheap",
      testCode: "assert gcd(4,2)==2", entryPoint: "gcd"
    },
    provider: mockProvider, // existing test provider
    executor: createMockExecutor({ resolved: true, testsPassed: 1, testsTotal: 1 })
  });
  expect(result.status).toBe("completed");
  expect(result.execution.resolved).toBe(true);
  expect(result.candidateCode).toContain("gcd");
});
```

Add an `execution-result` assertion in `tests/runner-events.test.ts` (collect events into an array, assert one has `type === "execution-result"`).

- [ ] **Step 9: Run the affected suites to verify they pass**

Run: `npx vitest run tests/workflows.test.ts tests/runner-events.test.ts tests/score-execution.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/evaluation/score-execution.ts lib/workflows/runner.ts lib/workflows/events.ts lib/store/file-store.ts lib/execution/provider.ts tests/score-execution.test.ts tests/workflows.test.ts tests/runner-events.test.ts
git commit -m "feat(runner): repurpose workflow runner for code repair with execution scoring"
```

---

### Task 6: E2B executor implementation

**Files:**
- Create: `lib/execution/e2b.ts`
- Modify: `lib/execution/provider.ts` (select E2B when `E2B_API_KEY` is set, else mock)
- Modify: `package.json` (add `@e2b/code-interpreter`)
- Modify: `.env.example` / `docs/commands.md` (document `E2B_API_KEY`)
- Test: `tests/e2b-executor.test.ts` (opt-in, gated)

**Interfaces:**
- Consumes: `SandboxExecutor`, `ExecutorArgs` (Task 3), `ExecutionResult` (Task 1).
- Produces: `createE2bExecutor(): SandboxExecutor` (`backend: "e2b"`); `createConfiguredExecutor()` finalized.

- [ ] **Step 1: Install the SDK**

Run: `npm install @e2b/code-interpreter`

- [ ] **Step 2: Write the gated integration test**

Create `tests/e2b-executor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createE2bExecutor } from "@/lib/execution/e2b";

const runIf = process.env.E2B_API_KEY ? it : it.skip;

describe("createE2bExecutor", () => {
  runIf("resolves a correct python fix against passing tests", async () => {
    const executor = createE2bExecutor();
    const result = await executor.run({
      language: "python",
      candidateCode: "def gcd(a, b):\n    return a if b == 0 else gcd(b, a % b)",
      testCode: "assert gcd(35, 21) == 7\nassert gcd(7, 49) == 7",
      entryPoint: "gcd",
      timeoutMs: 30000
    });
    expect(result.backend).toBe("e2b");
    expect(result.resolved).toBe(true);
    expect(result.testsTotal).toBeGreaterThan(0);
  }, 60000);
});
```

- [ ] **Step 3: Run test to verify it skips (no key) or fails (module missing)**

Run: `npx vitest run tests/e2b-executor.test.ts`
Expected: skipped if no `E2B_API_KEY`; if module missing, FAIL ("Cannot find module '@/lib/execution/e2b'").

- [ ] **Step 4: Implement the E2B executor**

Create `lib/execution/e2b.ts`. The candidate module + a pytest file are written into the sandbox; pytest is run; the summary line is parsed for passed/total.

```ts
import { Sandbox } from "@e2b/code-interpreter";
import type { ExecutionResult } from "@/lib/domain/types";
import type { ExecutorArgs, SandboxExecutor } from "@/lib/execution/executor";

function failed(message: string): ExecutionResult {
  return {
    resolved: false, testsPassed: 0, testsTotal: 0, exitCode: null,
    timedOut: false, stdout: "", stderr: message, durationMs: 0, backend: "e2b"
  };
}

/** Parse pytest's summary into passed/total. Each `assert` line is one logical test. */
function parsePytest(stdout: string, assertCount: number): { passed: number; total: number; resolved: boolean } {
  const total = Math.max(assertCount, 1);
  if (/\bpassed\b/.test(stdout) && !/\bfailed\b/.test(stdout) && !/\berror\b/i.test(stdout)) {
    return { passed: total, total, resolved: true };
  }
  return { passed: 0, total, resolved: false };
}

export function createE2bExecutor(): SandboxExecutor {
  return {
    async run(args: ExecutorArgs): Promise<ExecutionResult> {
      if (!process.env.E2B_API_KEY) {
        return failed("E2B_API_KEY is not set.");
      }
      if (args.language !== "python") {
        return failed(`Unsupported language: ${args.language}`);
      }
      const assertCount = args.testCode.split("\n").filter((line) => line.trim().startsWith("assert")).length;
      const module = args.entryPoint ?? "solution";
      const start = Date.now();
      let sandbox: Sandbox | undefined;
      try {
        sandbox = await Sandbox.create();
        await sandbox.files.write(`${module}.py`, args.candidateCode);
        const testFile = `from ${module} import *\n\ndef test_candidate():\n${args.testCode
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n")}\n`;
        await sandbox.files.write("test_candidate.py", testFile);
        const run = await sandbox.commands.run("python -m pytest -q test_candidate.py", {
          timeoutMs: args.timeoutMs
        });
        const stdout = run.stdout ?? "";
        const stderr = run.stderr ?? "";
        const parsed = parsePytest(stdout, assertCount);
        return {
          resolved: parsed.resolved,
          testsPassed: parsed.passed,
          testsTotal: parsed.total,
          exitCode: run.exitCode ?? null,
          timedOut: false,
          stdout,
          stderr,
          durationMs: Date.now() - start,
          backend: "e2b"
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "E2B execution failed.";
        return { ...failed(message), durationMs: Date.now() - start, timedOut: /timeout/i.test(message) };
      } finally {
        await sandbox?.kill();
      }
    }
  };
}
```

(Note: confirm the `@e2b/code-interpreter` API surface — `Sandbox.create`, `files.write`, `commands.run`, `kill` — against the installed version's types during implementation; adjust method names if the SDK differs. This is the one place to verify against live SDK docs.)

- [ ] **Step 5: Finalize the executor selector**

Replace `lib/execution/provider.ts` body:

```ts
import { createE2bExecutor } from "@/lib/execution/e2b";
import { createMockExecutor } from "@/lib/execution/mock-executor";
import type { SandboxExecutor } from "@/lib/execution/executor";

export function createConfiguredExecutor(): SandboxExecutor {
  if (process.env.E2B_API_KEY) {
    return createE2bExecutor();
  }
  return createMockExecutor({ resolved: false, testsPassed: 0, testsTotal: 0, stderr: "No sandbox configured (set E2B_API_KEY)." });
}
```

Document `E2B_API_KEY` in `.env.example` and `docs/commands.md`.

- [ ] **Step 6: Run the gated test + full suite**

Run: `npx vitest run tests/e2b-executor.test.ts` (skips without key) then `npm test`.
Expected: e2b test skipped/passes; full suite PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/execution/e2b.ts lib/execution/provider.ts package.json package-lock.json tests/e2b-executor.test.ts .env.example docs/commands.md
git commit -m "feat(execution): add E2B sandbox executor"
```

---

### Task 7: Evaluation cleanup + project-wide typecheck green

**Files:**
- Modify: `lib/evaluation/metrics.ts` (remove dead `computeEvaluationScores` or repurpose; delete if unused)
- Modify: any remaining importers of removed `Finding`/`computeEvaluationScores`
- Test: `tests/metrics.test.ts` (if present — update or remove)

**Interfaces:**
- Consumes: `scoreExecution` (Task 5).
- Produces: a codebase that passes `npm run typecheck` with zero references to `Finding`, `synthesizeFindings`, `qualityScore`, `truePositives`.

- [ ] **Step 1: Find all stale references**

Run: `npx tsc --noEmit`
Expected: a list of errors in files still referencing removed symbols (pages/components from Task 8 will appear here too).

- [ ] **Step 2: Remove the dead scorer**

If `computeEvaluationScores` has no remaining importers, delete `lib/evaluation/metrics.ts` and its test `tests/metrics.test.ts` (if any). If something still imports it, replace that usage with `scoreExecution`.

- [ ] **Step 3: Run typecheck for the lib layer**

Run: `npx tsc --noEmit`
Expected: remaining errors are confined to `app/**` and `components/**` (handled in Task 8). Record the list; no `lib/**` or `tests/**` errors remain.

- [ ] **Step 4: Commit**

```bash
git add lib/evaluation tests
git commit -m "refactor(evaluation): remove review-era scoring in favor of execution scoring"
```

---

### Task 8: New Run + Run Detail UI for repair results

**Files:**
- Modify: `app/runs/new/new-run-client.tsx`
- Modify: `app/runs/[id]/page.tsx` (and any run-detail client component)
- Modify: `lib/workflows/labels.ts` (no change expected; verify)
- Modify: `components/orchestration/use-run-stream.ts` (handle `execution-result` + new `run-final`)
- Modify: `components/orchestration/derive-node-states.ts` if it reads `findingsCount`
- Test: `tests/use-run-stream.test.ts` (update for new events)

**Interfaces:**
- Consumes: `RunResult.execution`, `RunResult.candidateCode`, `WorkflowEvent` `execution-result`/`run-final` (Tasks 1, 5).

- [ ] **Step 1: Update the stream hook test**

In `tests/use-run-stream.test.ts`, update fixtures so `run-final` carries `resolved`/`testsPassed`/`testsTotal`/`valueScore` and add an `execution-result` event; assert the hook exposes the execution result. (Mirror the existing test's structure; replace `findingsCount`/`qualityScore` references.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/use-run-stream.test.ts`
Expected: FAIL (hook does not yet expose execution state).

- [ ] **Step 3: Update the stream hook**

In `components/orchestration/use-run-stream.ts`, add handling for `execution-result` (store `result` in state, e.g. `executionResult`) and update the `run-final` handler to read the new fields. Remove `findingsCount`/`qualityScore` reads.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/use-run-stream.test.ts`
Expected: PASS.

- [ ] **Step 5: Update New Run UI**

In `app/runs/new/new-run-client.tsx`: on completion show a result card with **Resolved ✓/✗**, `testsPassed/testsTotal`, cost, latency, and a side-by-side of buggy `code` vs `candidateCode`. Remove the findings list. When a benchmark task is selected, the test code is taken from the task server-side (no UI field needed); for ad-hoc runs add a "Test code" textarea bound to `testCode` in the POST body.

- [ ] **Step 6: Update Run Detail UI**

In `app/runs/[id]/page.tsx`: replace the findings table with an execution panel — resolved badge, `testsPassed/testsTotal`, collapsible `execution.stdout`/`execution.stderr`, and the extracted `candidateCode`. Keep the model-call trace and the static orchestration replay.

- [ ] **Step 7: Verify the app builds and renders**

Run: `npm run build`
Expected: build succeeds (no type errors in `app/**`).

- [ ] **Step 8: Commit**

```bash
git add app/runs components/orchestration/use-run-stream.ts components/orchestration/derive-node-states.ts tests/use-run-stream.test.ts
git commit -m "feat(ui): show repair execution results on new-run and run-detail"
```

---

### Task 9: Dashboard + datasets guards (no broken renders)

**Files:**
- Modify: `app/page.tsx` (home overview)
- Modify: `app/dashboard/page.tsx` (and chart components)
- Modify: `app/datasets/page.tsx`, `app/datasets/[id]/page.tsx`
- Test: existing dataset/dashboard tests if present (update)

**Interfaces:**
- Consumes: `RunResult.execution`/`evaluation` (resolve-rate, valueScore), `BenchmarkTask` `source`/`testCode`/`referenceFix`.

- [ ] **Step 1: Guard the dashboard charts**

In `app/dashboard/page.tsx` and its chart components, replace reads of removed fields (`qualityScore`, `truePositives`, `findingsCount`) with execution metrics: chart **resolve rate** (`runs resolved / total`) and **value score** per workflow. Where a full rework is out of Phase-1 scope, render a clearly-labeled placeholder ("Repair metrics — full view in Phase 2") rather than crashing.

- [ ] **Step 2: Guard the home overview**

In `app/page.tsx`, replace any finding/quality summary with resolve-rate + run count. Ensure the page renders with zero runs.

- [ ] **Step 3: Update datasets pages**

In `app/datasets/page.tsx`: show `source` + language columns. In `app/datasets/[id]/page.tsx`: show buggy `code` + `testCode`; put `referenceFix` behind a "Reveal answer key" toggle. Remove knownBugs-only assumptions.

- [ ] **Step 4: Verify build + full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/dashboard app/datasets
git commit -m "feat(ui): guard dashboard and datasets pages for repair-mode data"
```

---

## Self-Review

**Spec coverage:**
- §3 adapter layer → Task 4. §3 sandbox executor → Tasks 3 (port/mock) + 6 (E2B). §3 repair runner → Task 5.
- §4 data model (ExecutionResult, BenchmarkTask, Evaluation, RunResult/RunInput) → Task 1; `Finding` removal → Tasks 1 + 7.
- §5 QuixBugs adapter + ingest script → Task 4.
- §6 extract-code → Task 2; executor port → Task 3; E2B impl → Task 6; runner changes + `execution-result` event → Task 5; determinism (mock executor/provider) → Tasks 3, 5.
- §7 scoring formula → Task 5 (`scoreExecution`).
- §8 New Run/Run Detail/Datasets/Home UI → Tasks 8, 9.
- §9 testing → tests in every task; gated E2B test → Task 6.
- §10 build order → Tasks 1–9 in order.

**Placeholder scan:** No "TBD"/"handle edge cases" steps; the one explicit verification flag is the E2B SDK method-name check (Task 6 Step 4), which is a deliberate live-SDK confirmation, not a placeholder.

**Type consistency:** `ExecutionResult`, `ExecutorArgs`, `SandboxExecutor`, `scoreExecution`, `extractCode`, `createMockExecutor`, `createE2bExecutor`, `createConfiguredExecutor`, `upsertBenchmarkTask`, `quixbugsAdapter` are used with consistent names/signatures across tasks. `backend` is `"e2b" | "mock"` throughout. `run-final` field set is consistent between events.ts (Task 5) and the hook (Task 8).

**Known follow-ups (not Phase 1):** Defects4J/SWE-bench Lite adapter, Vercel Sandbox executor, full dashboard repurpose, Java execution — all deferred per spec §2.
