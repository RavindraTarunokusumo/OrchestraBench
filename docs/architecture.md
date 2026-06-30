# Architecture

OrchestraBench is a small Next.js App Router application for running **code-repair** benchmark tasks through multiple orchestration workflows and comparing whether a fix passes the task's tests against cost, latency, and trace. (It began as a code-*review* benchmarker; Phase 1 of the benchmark-ingestion work repurposed it to code repair — see `docs/superpowers/specs/2026-06-26-benchmark-ingestion-repair-mode-design.md`.)

## Runtime Flow

```text
User submits run (SSE) / rerun (server action)
  -> createRunSchema / Zod validates input
  -> lib/store/file-store.ts resolveRunInput() fills testCode/entryPoint from the benchmark task
  -> lib/workflows/runner.ts executes the selected workflow (emits corrected code)
  -> lib/providers/provider.ts selects mock or OpenRouter provider
  -> lib/workflows/extract-code.ts pulls the candidate fix from the final answer
  -> lib/execution/provider.ts selects the SandboxExecutor (E2B when E2B_API_KEY set, else mock)
  -> executor runs the candidate against the task's test; ExecutionResult scored
  -> normalized RunResult (candidateCode + execution) written to .data/orchestrabench.json
  -> route pages read the file store and render results
```

The runner is synchronous. Per-task runs stream workflow events over SSE (`app/api/runs/stream/route.ts`); full-benchmark runs stream batch progress over SSE (`app/api/benchmarks/[slug]/stream/route.ts`). Inngest is the intended future background boundary, not yet wired.

## App Routes

- `/` home overview (resolve rate, run count).
- `/dashboard` lists benchmark cards (name, task count, resolve rate) and summarizes runs per workflow (resolve rate, value score, cost, latency) in a comparison table plus interactive charts — a resolve-rate-vs-cost scatter and a value-score leaderboard — all backed by `lib/benchmarks/catalog.ts` and `lib/dashboard/aggregate.ts`.
- `/benchmarks/[slug]` shows a benchmark's collapsible task list, side panel (buggy code, test, reference fix reveal), and links to run one task or the full suite.
- `/benchmarks/[slug]/run` configures and executes a full-benchmark run (one workflow across all runnable tasks) with a progress bar and text milestones only — no orchestration canvas.
- `/runs/new` is per-task only: requires `?taskId=` (optional `&benchmark=` for breadcrumb context); redirects to `/dashboard` when `taskId` is missing. Streams the live orchestration canvas via SSE.
- `/runs/[id]` shows the execution panel (resolved badge, tests passed, sandbox stdout/stderr, candidate code), evaluation, feedback controls, model-call trace, and static replay.
- `/datasets` redirects to `/dashboard`.
- `/datasets/[id]` redirects to `/benchmarks/[slug]?task=[id]`.
- `/workflows` static guide page: a card per workflow with a cost/quality tag, repair-framed description, the workflow graph (OrchestrationCanvas in static mode), and a text "Flow:" role sequence.
- `/api/runs/stream` SSE endpoint for a single repair run. `/api/benchmarks/[slug]/stream` SSE endpoint for a full-benchmark batch run. `/api/export` returns the file-store payload as JSON; `/api/export/csv` returns runs as a downloadable CSV (`lib/export/runs-csv.ts`).

## Core Modules

- `lib/domain/types.ts` — normalized workflow, run, model-call, `Evaluation`, `ExecutionResult`, and `BenchmarkTask` types (`RunResult` carries `candidateCode` + `execution`).
- `lib/workflows/runner.ts` — validates inputs, executes workflow-specific model-call sequences, extracts the candidate fix, runs it via the injected executor, and scores the execution.
- `lib/workflows/extract-code.ts` — pulls the candidate code from a model answer (largest fenced block, else trimmed answer).
- `lib/execution/executor.ts` — `SandboxExecutor` port; `e2b.ts` runs pytest in an E2B sandbox; `mock-executor.ts` returns scripted results for tests; `provider.ts` selects the backend.
- `lib/evaluation/score-execution.ts` — resolve + partial-credit + resolve-weighted value scoring.
- `lib/dashboard/aggregate.ts` — `summarizeByWorkflow` / `chartableSummaries`: pure per-workflow aggregation (resolve rate, value, cost, latency, test pass rate) shared by the dashboard table/charts and the dataset-detail per-task comparison; defensive against legacy runs with missing evaluation fields.
- `lib/benchmarks/catalog.ts` — derives `Benchmark` groupings from `BenchmarkTask.source` (slug, stats, task lookup).
- `lib/benchmarks/run-batch.ts` — sequential full-benchmark execution; stamps `batchId` on persisted runs.
- `lib/benchmarks/adapter.ts` + `quixbugs.ts` — `BenchmarkAdapter` port and the QuixBugs adapter; `scripts/ingest-benchmark.ts` vendors and ingests tasks.
- `lib/observability/langsmith.ts` — optional LangSmith run trees for workflow, model-call, and batch spans (no-op when env unset).
- `lib/store/file-store.ts` — local persistence, run creation/resolution, feedback, dataset CRUD, reruns, benchmark upsert, export.
- `lib/providers/*` — provider interface, mock provider, and OpenRouter provider.

## Workflows

All five emit a corrected-code final answer (repair mode):

- `single_cheap`: one cheap call.
- `single_strong`: one strong call.
- `panel_judge`: three cheap panelists, then a judge that merges their fixes into one corrected code block.
- `cheap_first`: cheap call, verifier confidence check, optional strong-model escalation when confidence is below `0.6` and the cost limit allows.
- `planner_worker_verifier`: planner, worker, verifier, then a finalizer that emits the corrected code.

Every workflow returns the same `RunResult` shape: status (`completed` when resolved, else `partial`), final answer, `candidateCode`, `execution`, model calls, evaluation, cost, latency, timestamps, and optional escalation metadata.

## Provider & Executor Selection

`createConfiguredProvider()` uses OpenRouter only when `OPENROUTER_API_KEY` is present, else the mock provider (`cohere/north-mini-code:free` defaults; strong model overridable via `OPENROUTER_STRONG_MODEL`). `createConfiguredExecutor()` uses the E2B executor when `E2B_API_KEY` is present, else a mock executor that reports unresolved.

## Current Constraints

- The real E2B execution path is unproven without `E2B_API_KEY`; all automated tests use the mock executor.
- The mock provider returns review-style prose, so local dev without a key does not exercise realistic extraction → execution (backlog).
- Runs are persisted after the workflow completes; partial provider failures are not captured as durable partial runs.
- Legacy persisted runs from the pre-repair shape are not migrated (backlog).
- Prisma is present as the target schema, but runtime persistence still uses the local file store.
