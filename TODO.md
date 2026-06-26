# TODO.md

This file contains active or future work only.

Completed sessions must be moved to `docs/iterations/archive/`.

## Backlog

- [ ] Benchmark ingestion + code-repair mode — Phase 1 (spec: `docs/superpowers/specs/2026-06-26-benchmark-ingestion-repair-mode-design.md`, plan: `docs/superpowers/plans/2026-06-26-benchmark-ingestion-repair-mode.md`). Implementer: Grok subagents (Step 4).
  - [x] Task 1 — Domain types + Zod contracts (ExecutionResult, repair-mode run/task shapes). [solo, foundation]
  - [ ] Task 2 — Code extractor (`lib/workflows/extract-code.ts`). [parallel batch A]
  - [ ] Task 3 — SandboxExecutor port + MockSandboxExecutor (`lib/execution/*`). [parallel batch A]
  - [ ] Task 4 — QuixBugs adapter + ingest script + `upsertBenchmarkTask`. [parallel batch A]
  - [ ] Task 5 — Repair runner + execution scoring (`scoreExecution`, runner rewrite). [needs 1,2,3,4]
  - [ ] Task 6 — E2B executor implementation (needs `E2B_API_KEY` to run live). [needs 1,3]
  - [ ] Task 7 — Evaluation cleanup + project-wide typecheck green. [needs 5]
  - [ ] Task 8 — New Run + Run Detail UI for repair results. [parallel batch B]
  - [ ] Task 9 — Dashboard + datasets guards. [parallel batch B]

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

- Add evaluation harness (Braintrust/LangSmith/etc.)
- Export results
- Human feedback UI
- Cost/latency budgets per workflow
