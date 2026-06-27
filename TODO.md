# TODO.md

This file contains active or future work only.

Completed sessions must be moved to `docs/iterations/archive/`.

## Backlog

- [ ] Benchmark ingestion + code-repair mode — Phase 1 (spec: `docs/superpowers/specs/2026-06-26-benchmark-ingestion-repair-mode-design.md`, plan: `docs/superpowers/plans/2026-06-26-benchmark-ingestion-repair-mode.md`). Implementer: Grok subagents (Step 4).
  - [x] Task 1 — Domain types + Zod contracts (ExecutionResult, repair-mode run/task shapes). [solo, foundation]
  - [x] Task 2 — Code extractor (`lib/workflows/extract-code.ts`). [parallel batch A]
  - [x] Task 3 — SandboxExecutor port + MockSandboxExecutor (`lib/execution/*`). [parallel batch A]
  - [x] Task 4 — QuixBugs adapter + ingest script + `upsertBenchmarkTask`. [parallel batch A]
    - [ ] Verify `QUIXBUGS_COMMIT` pin in `scripts/ingest-benchmark.ts` against the live repo before first real `npm run ingest:quixbugs` (currently unverified).
  - [x] Task 5 — Repair runner + execution scoring (`scoreExecution`, runner rewrite). [needs 1,2,3,4]
    - [x] Scope extension: updated the SSE route (`app/api/runs/stream/route.ts`) and its two tests, since `runWorkflow`'s new `executor`/`testCode` contract broke that caller (plan had only scheduled the client hook for Task 8). Exported `resolveRunInput` for reuse.
  - [x] Task 6 — E2B executor implementation. [needs 1,3] (runtime-unverified until `E2B_API_KEY` is provided)
  - [x] Task 7 — Evaluation cleanup (delete dead metrics scorer); lib/** typecheck-clean. [needs 5]
  - [x] Task 8 — New Run + Run Detail UI for repair results. [parallel batch B]
  - [x] Task 9 — Dashboard + datasets guards. [parallel batch B] (project typechecks + builds clean)

- [ ] UI overhaul + live orchestration view (spec: `docs/superpowers/specs/2026-06-23-ui-overhaul-orchestration-view-design.md`)
  - [x] Phase 1 — Tailwind v4 + shadcn/ui foundation, light/dark theming (next-themes), polished top nav. (894af25)
  - [x] Phase 2 — Workflow graph builder + streaming event types + `runWorkflow` `onEvent` refactor (callers unchanged). (7a20a7a)
  - [x] Phase 3 — `POST /api/runs/stream` route handler (SSE, validate, persist, emit run-final). (79349dc)
  - [x] Phase 4 — `OrchestrationCanvas` (GSAP) + `useRunStream` hook (live + static modes). (f0e3f7d)
  - [x] Phase 5 — New Run page live integration (in-place canvas, inline summary, link to detail). (90dec96)
  - [x] Phase 6 — Home landing/overview page (replace redirect). (60cc60f)
  - [x] Phase 7 — Dashboard charts (recharts) + empty/loading states + Run Detail static replay. (8e4b660, 71663f6, 98f81f0, fe7e58c, 81e0569)
  - Deferred: dedicated `/workflows` guide page (later session).

- [ ] MVP implementation from `SPEC.md`
  - [x] Shared foundation: Next.js/TypeScript app scaffold, Prisma schema, provider contracts, tests, and local env docs.
  - [x] Milestone 1 — Baseline Runner: single cheap/strong workflows and run detail page.
  - [x] Milestone 2 — Panel + Judge: independent panel calls, judge synthesis, and trace display.
  - [x] Milestone 3 — Cheap Escalation: verifier, escalation logic, cost limits, and comparison signals.
  - [x] Milestone 4 — Evaluation Dashboard: feedback, metrics, quality/value scores, and workflow comparison.
  - [x] Milestone 5 — Dataset Mode: benchmark task CRUD, seeded examples, reruns, and JSON export.

## Future Backlog

- file-store cross-process write race: `writeData` uses a temp-file rename guarded only by an in-process `mutationQueue`, so concurrent processes (e.g. parallel Vitest workers) can hit EPERM on Windows. Tests currently run with `fileParallelism: false`; consider per-process data dirs or atomic-write hardening if Windows CI parallelism is reintroduced.
- `OrchestrationCanvas` GSAP effect depends on the whole `nodeStates` object, so the `gsap.context` is reverted/rebuilt (incl. `querySelectorAll` + `getTotalLength` forced reflow) on every stream event, restarting active-node pulses. Narrow to a per-node tween model keyed on status/flowing signature so unrelated nodes don't re-pulse. (Code-review medium, deferred.)
- Centralize SSE wire framing: the `data: …\n\n` encoder in `app/api/runs/stream/route.ts` and the `parseSseChunk` decoder in `use-run-stream.ts` are independent literals. Extract a shared `encode/decode` module. (Code-review medium, deferred.)
- Add a shared `formatCostUsd`/score formatter (lib/utils) — cost/quality/value formatting is duplicated across home, dashboard, new-run, and run-detail. (Code-review medium, deferred.)
- Validate `entryPoint` as a Python identifier (`^[A-Za-z_][A-Za-z0-9_]*$`) in `createRunSchema` — API-supplied `entryPoint` flows into `from ${moduleName} import *` and the `${module}.py` filename in `lib/execution/e2b.ts`; a newline/malformed value can run module-level Python before pytest (sandbox-only) or break the harness. Not a host vuln (E2B is the trust boundary; security review PR #3 ruled it out) but cheap robustness hardening.

### Deferred from PR #3 bundled code review (Phase 2 / low value now)

- (#4) Legacy persisted runs (old `findings`/`qualityScore` shape, no `execution`) crash `app/runs/[id]/page.tsx`. Add a load-time normalizer in `readData` or a "legacy run" fallback panel. Affects only pre-existing local `.data` (gitignored).
- (#5) Live "Candidate fix" preview in `new-run-client.tsx` derives from the longest node `responsePreview`, not the final answer; multi-step workflows can show an intermediate snippet. Surface `candidateCode` on the `execution-result`/`run-final` SSE event instead.
- (#8) Mock provider returns review prose, not code, so local dev without `E2B_API_KEY` never exercises real extraction→execution. Make `buildMockText` emit a fenced code block for non-verifier roles.
- (#9) `parsePytest` in `lib/execution/e2b.ts` is binary (0 or all); `scoreExecution` supports partial credit. Parse pytest's passed/failed summary for partial counts.
- (#10) `latencyMs` excludes `execution.durationMs`; repair-run latency under-reports end-to-end time. Add execution duration or expose a separate `executionMs` across API/events/UI.
- (#13) `createRunSchema` lacks a repair-mode `.refine()` ("either `testCode` or resolvable `benchmarkTaskId`"); invalid inputs fail later with a generic error.
- (#14) `planner_worker_verifier` intermediate prompts (planner/worker/verifier) still ask for prose reviews; only the finalizer uses the repair prompt. Align intermediate prompts to code-fix reasoning (nit; works today).
- (ingest commit pin, dup of existing item) `scripts/ingest-benchmark.ts` skips clone when `.benchmarks/quixbugs` exists; a stale clone may not match `QUIXBUGS_COMMIT`. Verify HEAD against the pin or reclone.

- Add evaluation harness (Braintrust/LangSmith/etc.)
- Export results
- Human feedback UI
- Cost/latency budgets per workflow
