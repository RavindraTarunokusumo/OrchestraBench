# Benchmark-Centric UX, Bulk Runs & LangSmith Tracing — Spec

- Date: 2026-06-30
- Status: Draft (pending acceptance)
- Session: `feat/benchmark-ux-redesign` (worktree `.worktree/benchmark-ux-redesign`)
- Implementation: **native subagents** (Task tool), not ephemeral Grok CLI sessions
- Predecessors:
  - `docs/superpowers/specs/2026-06-26-benchmark-ingestion-repair-mode-design.md`
  - `docs/superpowers/specs/2026-06-27-repair-mode-phase2-dashboard-datasets.md`

## 1. Problem & Goal

OrchestraBench's current UX is task-centric and ad-hoc:

- `/datasets` lists flat tasks with no benchmark grouping.
- `/runs/new` is a free-form repair form unrelated to benchmark navigation.
- Reruns are per-task only (`rerunDatasetTask` loops workflows, not tasks).
- Model/cost controls are env-var defaults plus an optional cost limit; no UI model picker or token cap.
- No external trace export (LangSmith deferred in TODO L1).

**Goal:** reshape the product around **benchmarks** (e.g. QuixBugs) as the primary object users browse and run, while preserving the rich per-task run experience (orchestration canvas on `/runs/new`) and adding a simpler progress-only experience for **full-benchmark** runs.

### Headline user story

1. User lands on **Dashboard**, sees benchmark names (QuixBugs, Custom, …).
2. User selects a benchmark → **Benchmark page** (`/benchmarks/[slug]`).
3. Benchmark page shows a **collapsible task list** and a **side panel** when a task is selected.
4. Top-right **Run entire benchmark** → **Benchmark run page** with workflow, model, token, and cost controls → **loading bar + text progress** (no canvas).
5. Side-panel **Run this task** → **`/runs/new`** pre-filled for that task → **orchestration canvas** (existing live SSE UX).
6. All model calls optionally traced in **LangSmith** when configured.

### Recorded decisions

| Decision | Choice |
|---|---|
| Bulk run workflow scope | **One workflow per session** — every task in the benchmark runs once with the user-selected workflow |
| `/runs/new` | **Kept** — per-task runs only (from side panel or direct nav); retains OrchestrationCanvas |
| Full-benchmark run UI | **Progress bar + text milestones only** — no OrchestrationCanvas |
| Implementation handoff | **Subagents** (Cursor Task tool), orchestrator validates full suite |

## 2. Non-Goals

- Phase 3 heavy adapters (Defects4J, SWE-bench, Java, Vercel Sandbox).
- Background job queue / Inngest (bulk runs remain synchronous SSE in the request).
- Parallel task execution within a benchmark run (sequential only for MVP).
- Migrating persistence to PostgreSQL/Prisma.
- Human feedback UI redesign (L3).
- Running all five workflows in one bulk session (per-task rerun across all workflows is retired from the benchmark UX; single-workflow only).

## 3. Current State (grounding)

| Area | Today |
|---|---|
| Task storage | Flat `datasets: BenchmarkTask[]` in `.data/orchestrabench.json` |
| Benchmark grouping | Implicit via `BenchmarkTask.source` (`"quixbugs"` \| `"manual"`) |
| Per-task rerun | `rerunDatasetTask` — all 5 workflows, server action + API route |
| Single run SSE | `POST /api/runs/stream` → `runWorkflow` → canvas on `/runs/new` |
| Models | Hard-coded `CHEAP_MODEL` / `STRONG_MODEL` in `runner.ts`; env overrides only |
| Token limit | Not exposed |
| LangSmith | Not integrated |
| Routes | `/`, `/dashboard`, `/runs/new`, `/runs/[id]`, `/datasets`, `/datasets/[id]`, `/workflows` |

## 4. Information Architecture

### 4.1 Route map (target)

| Route | Purpose | Run UX |
|---|---|---|
| `/` | Marketing/overview; links to Dashboard | — |
| `/dashboard` | **Benchmark cards** (name, task count, resolve rate) + existing workflow comparison charts | — |
| `/benchmarks/[slug]` | Benchmark detail: collapsible tasks, side panel, **Run entire benchmark** CTA | — |
| `/benchmarks/[slug]/run` | Configure + execute **full benchmark** run | **Progress bar + text only** |
| `/runs/new` | Configure + execute **single task** run | **OrchestrationCanvas** (unchanged) |
| `/runs/[id]` | Run detail | — |
| `/workflows` | Static guide | — |
| `/datasets` | **301 redirect** → `/dashboard` | — |
| `/datasets/[id]` | **301 redirect** → `/benchmarks/[slug]?task=[id]` | — |

`slug` is a stable URL key derived from benchmark source (e.g. `quixbugs`, `custom`).

### 4.2 Navigation

- Remove **New Run** from global nav (per-task entry is contextual from benchmark side panel).
- Replace **Datasets** nav link with **Benchmarks** → `/dashboard` (benchmark cards section) or anchor `#benchmarks`.
- Dashboard empty state CTA: ingest QuixBugs (`npm run ingest:quixbugs`) instead of "New run".

## 5. Data Model

### 5.1 Derived `Benchmark` (no new persistence shape required)

```ts
// lib/benchmarks/catalog.ts
export type Benchmark = {
  slug: string;           // URL key, e.g. "quixbugs"
  name: string;           // Display name, e.g. "QuixBugs"
  source: BenchmarkTask["source"];
  description?: string;
  taskCount: number;
  resolvedRate: number;   // across runs linked to tasks in this benchmark
};

export function listBenchmarks(tasks: BenchmarkTask[], runs: RunResult[]): Benchmark[];
export function getBenchmark(slug: string, tasks: BenchmarkTask[], runs: RunResult[]): Benchmark | undefined;
export function tasksForBenchmark(slug: string, tasks: BenchmarkTask[]): BenchmarkTask[];
```

Display-name map (MVP):

| `source` | `slug` | `name` |
|---|---|---|
| `quixbugs` | `quixbugs` | QuixBugs |
| `manual` | `custom` | Custom |

### 5.2 Run configuration (extended `RunInput`)

```ts
export type RunConfig = {
  workflow: WorkflowKind;
  costLimitUsd?: number;
  maxOutputTokens?: number;      // per model call, forwarded to provider
  cheapModel?: string;           // overrides runner default
  strongModel?: string;          // overrides runner default
};

export type BenchmarkRunInput = RunConfig & {
  benchmarkSlug: string;
};

export type TaskRunInput = RunConfig & {
  benchmarkTaskId: string;
};
```

`RunResult` additions (persisted):

```ts
batchId?: string;        // shared UUID for all runs in one benchmark session
batchIndex?: number;     // 0-based position in batch
batchTotal?: number;     // total tasks in batch
```

Existing `benchmarkTaskId` unchanged.

### 5.3 Store changes

- `createRun` / `runWorkflow` accept optional `RunConfig` model + token fields.
- New `runBenchmarkTasks(slug, config, onEvent)` in `lib/benchmarks/run-batch.ts`:
  - Resolves all runnable tasks for slug (must have `testCode` + `entryPoint` where required).
  - Generates one `batchId`.
  - Sequentially calls existing `createRun` + `runWorkflow` path per task.
  - Emits batch progress events (see §7).
- **Deprecate** `rerunDatasetTask` multi-workflow loop from UI (keep function temporarily for API compat or remove in same PR with redirect tests).

## 6. Run Configuration UI (shared)

Extract a shared **`RunConfigForm`** component used by:

- `/benchmarks/[slug]/run` (bulk)
- `/runs/new` (per-task, when launched from benchmark context)

Fields:

| Field | Control | Default |
|---|---|---|
| Workflow | Select (5 kinds) | `cheap_first` |
| Cheap model | Text input or preset select | `cohere/north-mini-code:free` |
| Strong model | Text input or preset select | `OPENROUTER_STRONG_MODEL` or same cheap default |
| Max output tokens | Number input (optional) | provider default (~1024) |
| Cost budget (USD) | Number input (optional) | unset |

Validation via extended Zod schema in `lib/api/contracts.ts`.

Per-task `/runs/new` when opened from side panel:

- Pre-fill `benchmarkTaskId`, title, language, prompt, code (hidden or read-only summary).
- Hide free-form code/test editors; show task name breadcrumb back to benchmark.
- Submit → existing `useRunStream` → canvas.

Direct `/runs/new` without `taskId` query: **redirect** to `/dashboard` (no orphan ad-hoc runs in MVP).

## 7. Bulk Benchmark Run — API & Events

### 7.1 Endpoint

`POST /api/benchmarks/[slug]/stream`

Body: `BenchmarkRunInput` (Zod-validated).

Response: SSE stream (reuse `encodeSseEvent`).

### 7.2 Event protocol (new + reused)

```
benchmark-start  { batchId, slug, name, taskTotal, workflow }
task-start       { batchId, taskIndex, taskTotal, taskId, taskTitle }
  … existing workflow events scoped under current task …
task-final       { batchId, taskIndex, taskId, runId, resolved, costUsd, latencyMs }
task-error       { batchId, taskIndex, taskId, error }
benchmark-final  { batchId, completed, failed, runIds[], aggregateResolvedRate }
run-error        { message }   // fatal
```

Workflow events (`step-start`, `step-end`, `flow-active`, …) are **not emitted** to the bulk-run client (runner still executes internally; canvas is not mounted). Server may still log them to LangSmith.

### 7.3 Benchmark run page UI

`/benchmarks/[slug]/run`:

- Shows `RunConfigForm` until started.
- On submit: hide form, show:
  - **Determinate progress bar** (`taskIndex / taskTotal`).
  - **Text log** of milestones (e.g. "Running gcd (3/10)…", "gcd resolved ✓", "Running bitcount (4/10)…").
  - Link to dashboard when `benchmark-final` arrives.
- No `OrchestrationCanvas`.

## 8. Benchmark Page UI

`/benchmarks/[slug]` — server component shell + client islands.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ QuixBugs · 10 tasks · 40% resolved     [Run entire benchmark]│
├──────────────────────────┬──────────────────────────────────┤
│ ▼ gcd                    │  Side panel (selected task)      │
│   bitcount               │  - prompt, buggy code, tests     │
│   hanoi                  │  - reveal reference fix          │
│   …                      │  - per-task stats                │
│                          │  [Run this task] → /runs/new?…   │
└──────────────────────────┴──────────────────────────────────┘
```

- Task list: **collapsible** `<details>` per task OR accordion (one open at a time). Collapsed row shows title + resolve stats; expanded shows compact code preview.
- Side panel: opens on task row click; persists selection in URL `?task=<id>`.
- **Run entire benchmark** (top right) → `/benchmarks/[slug]/run`.
- **Run this task** → `/runs/new?taskId=<id>&benchmark=<slug>`.

Remove per-task multi-workflow rerun form from old dataset detail page.

### 8.1 Dashboard benchmark section

Above existing workflow comparison table/charts, add **benchmark cards grid**:

- Name, task count, benchmark-level resolve rate, link to `/benchmarks/[slug]`.
- Empty: prompt to run `npm run ingest:quixbugs`.

## 9. LangSmith Tracing

### 9.1 Integration approach

Use the **`langsmith` npm package** with manual run trees (project uses direct OpenRouter `fetch`, not LangChain/Vercel AI SDK).

```
lib/observability/langsmith.ts
  isTracingEnabled(): boolean
  traceWorkflowRun(input, fn): Promise<RunResult>
  traceModelCall(parentRun, request, fn): Promise<ModelResponse>
  traceBenchmarkBatch(batchId, slug, fn): Promise<void>
```

Wrap at:

1. **Provider boundary** — each `provider.complete()` becomes an LLM child span.
2. **Workflow boundary** — parent run per `runWorkflow` with metadata: `workflow`, `benchmarkTaskId`, `batchId`, `batchIndex`.
3. **Batch boundary** — parent run per benchmark session.

### 9.2 Configuration (optional, graceful no-op)

| Env var | Purpose |
|---|---|
| `LANGCHAIN_TRACING_V2` | `"true"` to enable |
| `LANGCHAIN_API_KEY` | LangSmith API key |
| `LANGCHAIN_PROJECT` | Project name (default `orchestrabench`) |

When disabled: zero overhead passthrough wrappers.

### 9.3 Metadata per span

- `run_id`, `workflow`, `benchmark_slug`, `benchmark_task_id`, `batch_id`, `model`, `role`, `cost_usd`, `resolved`, `tests_passed`, `tests_total`.

Document in `.env.example` and `docs/commands.md`.

## 10. Provider & Runner Changes

- `ModelRequest` gains optional `maxOutputTokens?: number`.
- `createOpenRouterProvider` forwards `max_tokens` when set.
- `runWorkflow` accepts `RunConfig` and uses `cheapModel` / `strongModel` overrides instead of module-level constants.
- Cost-limit projection uses the configured model ids.

## 11. Edge Cases

| Case | Behavior |
|---|---|
| Benchmark with 0 tasks | Benchmark page empty state; Run entire disabled |
| Task missing `testCode` | Excluded from bulk run; called out in UI |
| Mid-batch task failure | Emit `task-error`, continue to next task |
| Client disconnects during bulk SSE | Server completes remaining tasks + persists (same as today) |
| LangSmith unavailable | Log warning once; runs proceed |
| `/runs/new` without `taskId` | Redirect `/dashboard` |
| Unknown benchmark slug | 404 |
| Mock provider | Model fields shown but ignored (label explains) |

## 12. Success Criteria

1. Dashboard lists benchmarks by name; clicking opens benchmark page.
2. Benchmark page shows collapsible tasks + side panel with **Run this task**.
3. **Run entire benchmark** runs all tasks sequentially with one selected workflow; UI is progress bar + text only.
4. Per-task run uses `/runs/new` with canvas unchanged.
5. LangSmith shows nested traces for workflow + LLM calls when env is set.
6. `/datasets/*` redirects cleanly; no broken nav links.
7. Full test suite + typecheck + lint pass.

## 13. Testing Plan

| Layer | Tests |
|---|---|
| `lib/benchmarks/catalog.ts` | Grouping, slug resolution, stats |
| `lib/benchmarks/run-batch.ts` | Sequential execution, batchId stamping, skip unrunnable |
| `lib/api/contracts.ts` | Extended schemas (models, tokens, batch body) |
| `lib/observability/langsmith.ts` | No-op when disabled; span creation when mocked |
| `app/api/benchmarks/[slug]/stream` | SSE framing, event order |
| Runner | Model override + maxOutputTokens forwarded |
| Redirects | `/datasets` → `/dashboard` |

## 14. Lightweight Implementation Plan (subagent contract)

Build order (each task = one subagent + orchestrator full-suite gate + commit):

| # | Task | Key files | Interfaces |
|---|---|---|---|
| 1 | Benchmark catalog module | `lib/benchmarks/catalog.ts`, `tests/benchmark-catalog.test.ts` | `listBenchmarks`, `getBenchmark`, `tasksForBenchmark` |
| 2 | RunConfig extension | `lib/domain/types.ts`, `lib/api/contracts.ts`, `runner.ts`, providers | `RunConfig` plumbed through `runWorkflow`, `createRun` |
| 3 | LangSmith wrappers | `lib/observability/langsmith.ts`, provider/runner hooks | `traceModelCall`, `traceWorkflowRun` |
| 4 | Batch runner + SSE API | `lib/benchmarks/run-batch.ts`, `app/api/benchmarks/[slug]/stream/route.ts` | `benchmark-start`…`benchmark-final` events |
| 5 | Shared RunConfigForm | `components/runs/run-config-form.tsx` | Consumed by run pages |
| 6 | Benchmark run page (progress UI) | `app/benchmarks/[slug]/run/page.tsx`, client component | Progress bar + text log |
| 7 | Benchmark detail page | `app/benchmarks/[slug]/page.tsx`, client side panel | Collapsible tasks, CTAs |
| 8 | Dashboard benchmark cards | `app/dashboard/page.tsx` | Cards linking to benchmarks |
| 9 | `/runs/new` per-task only | `app/runs/new/*` | Query pre-fill; redirect without `taskId` |
| 10 | Nav + redirects + cleanup | `app/layout.tsx`, `app/datasets/*`, remove old rerun UI | 301 redirects |
| 11 | Docs + `.env.example` | `docs/architecture.md`, `docs/commands.md` | LangSmith + new routes |

**Risks:** SSE event type additions must update `use-run-stream` discriminated union only for per-task path; bulk client uses a separate hook (`use-benchmark-stream.ts`) to avoid canvas coupling.

## 15. Open Items (none blocking)

All clarifications resolved:
- Bulk = single workflow per session ✓
- Keep `/runs/new` for per-task with canvas ✓
- Bulk UI = progress bar + text only ✓

---

**Next step:** User acceptance of this spec → lightweight plan logged in `TODO.md` → subagent implementation in worktree `feat/benchmark-ux-redesign`.
