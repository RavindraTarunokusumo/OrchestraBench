# Benchmark-Centric UX + LangSmith Tracing (archived)

- Merged: PR #18 → `main` as merge commit `86fc718` (2026-07-01)
- Spec: `docs/superpowers/specs/2026-06-30-benchmark-ux-langsmith-design.md` (22b73db)
- Branch: `feat/benchmark-ux-redesign` · worktree `.worktree/benchmark-ux-redesign`
- Handoff: native Cursor subagents (Task tool), orchestrator full-suite gate per commit; code review via generalPurpose subagent (not Grok ephemeral CLI).

Redesigned navigation around **benchmarks** (QuixBugs, Custom): dashboard cards → benchmark detail (collapsible tasks + side panel) → full-suite run (progress bar + text) or per-task run (orchestration canvas on `/runs/new`). Added optional LangSmith tracing, shared `RunConfigForm` (workflow, models, token cap, cost budget), and batch SSE API.

## Tasks (commit-tagged)

- [x] Task 1 — Benchmark catalog (`lib/benchmarks/catalog.ts`, tests). (ff417d8)
- [x] Task 2 — `RunConfig` extension through types, contracts, runner, providers. (6c3cbda)
- [x] Task 3 — LangSmith wrappers (`lib/observability/langsmith.ts`). (2ce59e7)
- [x] Task 4 — Batch runner + `POST /api/benchmarks/[slug]/stream`. (c177682)
- [x] Tasks 5–10 — UI: `RunConfigForm`, benchmark pages, dashboard cards, `/runs/new` per-task only, nav + redirects. (18faf2e)
- [x] Task 11 — Docs + `.env.example`. (01cbb31)
- [x] PR #18 review fixes — `traceBenchmarkBatch` wiring, server model defaults in form, task titles in progress log, empty-batch 400, `permanentRedirect` for `/datasets/*`. (bdd7672)

## Review

Subagent code review (pre-merge): 3 bugs addressed in `bdd7672`. Suggestions deferred: stale `rerunDatasetAction` redirects, API auth/rate limits (same exposure as `/api/runs/stream`).

## Validation

`npm test` 156 passed / 1 skipped, `npm run typecheck` clean, `npm run lint` clean.

## Notes

- Bulk runs: one workflow per session, sequential tasks, `batchId` stamped on each `RunResult`.
- `/runs/new` without `taskId` redirects to `/dashboard`.
- L1 (full external eval harness) only partially addressed — LangSmith trace export added; Braintrust/LangSmith eval workflows remain deferred.
