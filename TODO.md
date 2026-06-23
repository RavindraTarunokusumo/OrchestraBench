# TODO.md

This file contains active or future work only.

Completed sessions must be moved to `docs/iterations/archive/`.

## Backlog

- [ ] UI overhaul + live orchestration view (spec: `docs/superpowers/specs/2026-06-23-ui-overhaul-orchestration-view-design.md`)
  - [x] Phase 1 — Tailwind v4 + shadcn/ui foundation, light/dark theming (next-themes), polished top nav. (894af25)
  - [x] Phase 2 — Workflow graph builder + streaming event types + `runWorkflow` `onEvent` refactor (callers unchanged). (7a20a7a)
  - [x] Phase 3 — `POST /api/runs/stream` route handler (SSE, validate, persist, emit run-final). (79349dc)
  - [ ] Phase 4 — `OrchestrationCanvas` (GSAP) + `useRunStream` hook (live + static modes).
  - [ ] Phase 5 — New Run page live integration (in-place canvas, inline summary, link to detail).
  - [ ] Phase 6 — Home landing/overview page (replace redirect).
  - [ ] Phase 7 — Dashboard charts (recharts) + empty/loading states + Run Detail static replay.
  - Deferred: dedicated `/workflows` guide page (later session).

- [ ] MVP implementation from `SPEC.md`
  - [x] Shared foundation: Next.js/TypeScript app scaffold, Prisma schema, provider contracts, tests, and local env docs.
  - [x] Milestone 1 — Baseline Runner: single cheap/strong workflows and run detail page.
  - [x] Milestone 2 — Panel + Judge: independent panel calls, judge synthesis, and trace display.
  - [x] Milestone 3 — Cheap Escalation: verifier, escalation logic, cost limits, and comparison signals.
  - [x] Milestone 4 — Evaluation Dashboard: feedback, metrics, quality/value scores, and workflow comparison.
  - [x] Milestone 5 — Dataset Mode: benchmark task CRUD, seeded examples, reruns, and JSON export.

## Future Backlog

- Add evaluation harness (Braintrust/LangSmith/etc.)
- Export results
- Human feedback UI
- Cost/latency budgets per workflow
