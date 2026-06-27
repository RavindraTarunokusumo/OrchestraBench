# Earlier Sessions — MVP + UI Overhaul (archived)

Completed before the benchmark/repair-mode work. Preserved here so `TODO.md` holds only active/future items.

## UI overhaul + live orchestration view

Spec: `docs/superpowers/specs/2026-06-23-ui-overhaul-orchestration-view-design.md`. Merged via PR #2 (`c4d8437`).

- [x] Phase 1 — Tailwind v4 + shadcn/ui foundation, light/dark theming (next-themes), polished top nav. (894af25)
- [x] Phase 2 — Workflow graph builder + streaming event types + `runWorkflow` `onEvent` refactor. (7a20a7a)
- [x] Phase 3 — `POST /api/runs/stream` route handler (SSE, validate, persist, emit run-final). (79349dc)
- [x] Phase 4 — `OrchestrationCanvas` (GSAP) + `useRunStream` hook (live + static modes). (f0e3f7d)
- [x] Phase 5 — New Run page live integration (in-place canvas, inline summary, link to detail). (90dec96)
- [x] Phase 6 — Home landing/overview page (replace redirect). (60cc60f)
- [x] Phase 7 — Dashboard charts (recharts) + empty/loading states + Run Detail static replay. (8e4b660, 71663f6, 98f81f0, fe7e58c, 81e0569)
- Carried forward: dedicated `/workflows` guide page (deferred; see Future Backlog).

> Note: much of the Phase 7 dashboard/charts work was subsequently superseded by the repair-mode guards in PR #3 (Phase 2 of repair mode will fully rework the dashboard).

## MVP implementation from `SPEC.md`

- [x] Shared foundation: Next.js/TypeScript app scaffold, Prisma schema, provider contracts, tests, local env docs.
- [x] Milestone 1 — Baseline Runner: single cheap/strong workflows and run detail page.
- [x] Milestone 2 — Panel + Judge: independent panel calls, judge synthesis, trace display.
- [x] Milestone 3 — Cheap Escalation: verifier, escalation logic, cost limits, comparison signals.
- [x] Milestone 4 — Evaluation Dashboard: feedback, metrics, quality/value scores, workflow comparison.
- [x] Milestone 5 — Dataset Mode: benchmark task CRUD, seeded examples, reruns, JSON export.

> Note: the review-era evaluation (quality/value, TP/FP, seeded known-bug examples) was replaced by execution-based scoring in the repair-mode pivot (PR #3).
