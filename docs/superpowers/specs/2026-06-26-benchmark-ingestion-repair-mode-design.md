# Benchmark Ingestion + Code-Repair Mode — Design

- Date: 2026-06-26
- Status: Accepted (pending written-spec review)
- Scope: Phase 1 only (QuixBugs adapter, repair runner, E2B executor, execution-based evaluation, minimal UI)

## 1. Problem & Goal

OrchestraBench today is a **code-review** benchmarker: workflows emit prose reviews, `synthesizeFindings` matches that prose against a hand-authored `knownBugs` answer key by token overlap, and runs are scored on true/false positives and a quality/value score (`lib/workflows/runner.ts`, `lib/evaluation/metrics.ts`).

We want OrchestraBench to run its orchestration workflows against **real, downloadable benchmarks** and be judged the way those benchmarks are judged: produce a **code fix** and validate it by **running the benchmark's tests**. This repurposes the existing pipeline so code-repair-with-test-execution becomes the primary path.

Decisions locked during brainstorming:
- **Evaluation model:** patch-generation + test execution (not prose bug-finding).
- **First dataset:** QuixBugs (light, self-contained, single-file, one bug each, runnable tests). Defects4J / SWE-bench Lite deferred to a later phase.
- **Execution backend:** E2B sandbox, implemented behind a `SandboxExecutor` interface so Vercel Sandbox can drop in later.
- **Relationship to existing pipeline:** repurpose it — the review-oriented finding/scoring logic is replaced rather than kept in parallel.

## 2. Non-Goals (Phase 1)

- Defects4J, SWE-bench Lite, or any repo-checkout / multi-file benchmark.
- A Vercel Sandbox executor implementation (interface only; impl later).
- Java (or any non-Python) execution.
- A full dashboard/datasets repurpose — Phase 1 keeps those pages rendering without crashing; full rework is Phase 2.

## 3. Architecture

Three new subsystems plus edits to the runner and evaluation:

1. **Benchmark adapter layer** (`lib/benchmarks/`) — a pluggable `BenchmarkAdapter` port; first impl `quixbugs`. A re-runnable ingest script vendors raw benchmark data and emits normalized `BenchmarkTask` records into the store.
2. **Sandbox executor** (`lib/execution/`) — a `SandboxExecutor` port; E2B impl for Phase 1, plus a `MockSandboxExecutor` for hermetic tests. Takes candidate code + test code + language, returns a structured `ExecutionResult`.
3. **Repair runner** — workflow prompts emit corrected code; a code-extractor pulls the candidate from the model's final answer; the executor runs it; an execution-based evaluator replaces `synthesizeFindings` / `evaluateRun`.

Reused unchanged: the orchestration graph (`lib/workflows/graph.ts`), streaming event scaffold (`lib/workflows/events.ts`), run persistence (`lib/store/file-store.ts`), model providers (`lib/providers/*`), and the live canvas shell.

### Phasing

- **Phase 1 (this spec):** QuixBugs adapter + ingest script → repair runner + code extraction → E2B executor → execution-based evaluation → run records carry `ExecutionResult` → New Run + Run Detail show pass/fail. Get one workflow green end-to-end, then all five.
- **Phase 2 (later spec):** Dashboard/datasets pages fully repurposed to repair metrics; cross-workflow resolve-rate vs cost comparison.
- **Phase 3 (later spec):** Heavy adapter (Defects4J or SWE-bench Lite) with repo checkout in the sandbox; multi-language execution; Vercel Sandbox adapter.

## 4. Data Model

Grounded in `lib/domain/types.ts`.

### `BenchmarkTask` (extended)

The existing `code` field holds the **buggy** code.

```ts
testCode: string;          // the benchmark's test for this task
referenceFix?: string;     // gold/correct version, held out — debugging & "max achievable" only, never shown to workflows
entryPoint?: string;       // function/module under test (needed to wire the generated test harness)
source: "manual" | "quixbugs";
// knownBugs becomes optional (legacy review tasks); repair tasks do not use it
```

### `ExecutionResult` (new)

```ts
type ExecutionResult = {
  resolved: boolean;        // all tests passed
  testsPassed: number;
  testsTotal: number;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  backend: "e2b" | "mock";
};
```

### `Evaluation` (repurposed)

```ts
type Evaluation = {
  resolved: boolean;
  testsPassed: number;
  testsTotal: number;
  valueScore: number;       // resolve-weighted per cost (see §7)
  judgeConfidence?: number;
  userRating?: number;
  notes?: string;
};
```

### `RunResult` / `RunInput`

- `RunResult`: `findings: Finding[]` → `candidateCode: string` (extracted fix) + `execution: ExecutionResult`.
- `RunInput`: gains `testCode` and `entryPoint`; `knownBugs` no longer required.
- `Finding`, `truthState`, and the TP/FP machinery in `lib/evaluation/metrics.ts` are removed or rewritten for resolve-rate.
- The two review-style seed datasets in `file-store.ts` are replaced by ingested QuixBugs tasks (the manual-review shape remains expressible via `source: "manual"` for backward compatibility but is not seeded).

Blast radius to enumerate in the plan: `lib/evaluation/metrics.ts`, `lib/api/contracts.ts` (Zod schemas), and every page/component that renders `findings` (`app/runs/**`, `app/datasets/**`, dashboard/home, `components/orchestration/*`).

## 5. QuixBugs Ingestion Adapter

QuixBugs layout: `python_programs/` (buggy, one bug each), `correct_python_programs/` (gold), `json_testcases/` (input→expected rows), pytest-based runner.

### Port — `lib/benchmarks/adapter.ts`

```ts
interface BenchmarkAdapter {
  source: string;                       // "quixbugs"
  ingest(rawDir: string): Promise<BenchmarkTask[]>;
}
```

### Impl — `lib/benchmarks/quixbugs.ts`

Per program:
- `code` = buggy file contents.
- `referenceFix` = correct file contents.
- `entryPoint` = the function name (program name).
- `testCode` = a generated pytest harness that imports the candidate module and asserts it against the program's `json_testcases` rows.
- `prompt` = fixed repair instruction: "Fix the bug in this function so all tests pass; return only the corrected code."
- `language` = `"python"`, `source` = `"quixbugs"`, deterministic `id` = `quixbugs_<program>`.

### Script — `scripts/ingest-benchmark.ts`

- CLI; vendors the raw repo into a gitignored `.benchmarks/quixbugs/` via shallow `git clone` pinned to a fixed commit (reproducibility); raw tree is **not** committed.
- Runs the adapter, upserts records through the store. Idempotent / re-runnable.
- Phase 1 ingests a curated subset (~10 programs) for fast first runs; expandable to all 40 via a flag.
- Licensing/attribution for QuixBugs noted (MIT-style); we vendor at a pinned commit and do not redistribute the raw tree.

## 6. Repair Runner + E2B Executor

### Code extraction — `lib/workflows/extract-code.ts`

Pure function. Pull the candidate fix from the model's final answer: prefer a fenced ```python block; fall back to the largest code-ish span; else treat the whole answer as code. Unit-tested across fenced / unfenced / multi-block / garbage inputs.

### Executor port — `lib/execution/executor.ts`

```ts
interface SandboxExecutor {
  run(args: {
    language: string;
    candidateCode: string;
    testCode: string;
    entryPoint?: string;
    timeoutMs: number;
  }): Promise<ExecutionResult>;
}
```

### E2B impl — `lib/execution/e2b.ts`

- Spin up an E2B sandbox, write the candidate as the module + the pytest harness, run pytest, parse passed/total from output, return `ExecutionResult`.
- Hard timeout sets `timedOut`. Missing `E2B_API_KEY` → run fails cleanly with a clear message (no crash).

### Mock impl — `lib/execution/mock-executor.ts`

Returns scripted pass/fail for hermetic tests; `backend: "mock"`.

### Runner changes — `lib/workflows/runner.ts`

- Workflow prompts switch from "return findings" to "return corrected code."
- After orchestration produces `finalAnswer`: `extractCode` → `executor.run` → `scoreExecution` → build execution-based `Evaluation`.
- `synthesizeFindings` / `matchesKnownBug` / `evaluateRun` removed.
- Graph / streaming / cost / escalation scaffolding stays. Escalation keys off execution outcome (or a verifier signal) rather than confidence prose.
- New streaming event `execution-result` emitted when the sandbox finishes, so the canvas can show the test outcome.

### Determinism

`MockSandboxExecutor` + the existing mock provider (configured to return `referenceFix`) keep unit/integration tests hermetic — no network, no real E2B in CI. The executor is injected into the runner (same pattern as `provider`).

## 7. Evaluation & Scoring

`lib/evaluation/metrics.ts` rewritten:
- Primary metric: **resolved** (all tests pass).
- Partial credit: `testsPassed / testsTotal`.
- `valueScore` = resolve-weighted per cost:
  `valueScore = (resolved ? 1 : testsPassed / max(testsTotal, 1)) / (costUsd + ε)`, with a fixed small `ε` to avoid divide-by-zero and keep free-tier runs comparable. A cheap workflow that resolves outranks an expensive one that does not.

## 8. UI (Phase 1, minimal)

- **New Run** (`app/runs/new`): pick a benchmark task (or paste buggy code + test), run a workflow, watch the canvas; on finish show Resolved ✓/✗, tests x/y, cost, latency, and a candidate-vs-buggy code diff.
- **Run Detail** (`app/runs/[id]`): replace the findings table with an execution panel — resolved badge, tests passed, collapsible sandbox stdout/stderr, extracted candidate code; model-call trace unchanged.
- **Datasets** (`app/datasets`): list shows `source` + language; detail shows buggy code + test, with the reference fix behind a "reveal" toggle (it is the answer key).
- **Home / Dashboard**: kept rendering in Phase 1; charts reading removed fields are guarded/stubbed and fully reworked in Phase 2. Each guarded spot is called out in the plan.

## 9. Testing

Per `docs/testing.md` (Vitest, `fileParallelism: false`):
- `extract-code` — fenced / unfenced / multi-block / garbage.
- `quixbugs` adapter — fixture raw dir → expected normalized tasks; idempotent ingest.
- Runner — `MockSandboxExecutor` + mock provider returning the reference fix → asserts resolved/partial scoring and the `execution-result` event for all 5 workflows.
- `scoreExecution` — resolved, partial, zero-tests, timeout.
- API contracts — updated Zod schemas for the new run/task shapes.
- E2B impl — one opt-in integration test gated on `E2B_API_KEY`, skipped in CI.

## 10. Build Order

Each step is its own commit, logged in `TODO.md`:

1. Types + Zod contract updates.
2. `extract-code`.
3. `SandboxExecutor` port + `MockSandboxExecutor`.
4. QuixBugs adapter + ingest script.
5. Runner repurpose — one workflow green end-to-end, then all five.
6. E2B impl.
7. Evaluation rewrite.
8. New Run + Run Detail UI.
9. Dashboard guards.

## 11. Risks & Open Questions

- **Repurpose regresses shipped review behavior** (M1–M5). Accepted by decision; review scoring is intentionally removed.
- **E2B cost/latency** per run — bounded by curated subset + timeouts; free credit covers Phase 1.
- **Code extraction reliability** — models may wrap fixes in prose; the extractor's fallbacks plus the mock-provider tests mitigate, but real-model extraction quality is a watch item.
- **Dashboard guards** are a stopgap; Phase 2 must follow reasonably soon to avoid a half-migrated UI lingering.
