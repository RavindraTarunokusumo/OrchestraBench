# TODO.md

Active work only. Archive completed sessions under `docs/iterations/archive/`.

## Session: Benchmark UX + LangSmith (2026-06-30)

Spec: `docs/superpowers/specs/2026-06-30-benchmark-ux-langsmith-design.md` (approved)
Branch: `feat/benchmark-ux-redesign` · worktree `.worktree/benchmark-ux-redesign`
Handoff: native subagents (Task tool), orchestrator full-suite gate per commit.

- [ ] **Task 1** — Benchmark catalog (`lib/benchmarks/catalog.ts`, tests)
- [ ] **Task 2** — RunConfig extension (types, contracts, runner, providers)
- [ ] **Task 3** — LangSmith wrappers (`lib/observability/langsmith.ts`)
- [ ] **Task 4** — Batch runner + SSE API (`lib/benchmarks/run-batch.ts`, route)
- [ ] **Task 5** — Shared `RunConfigForm` component
- [ ] **Task 6** — Benchmark run page (progress bar UI)
- [ ] **Task 7** — Benchmark detail page (collapsible tasks + side panel)
- [ ] **Task 8** — Dashboard benchmark cards
- [ ] **Task 9** — `/runs/new` per-task only (query pre-fill, redirect)
- [ ] **Task 10** — Nav + redirects + cleanup old rerun UI
- [ ] **Task 11** — Docs + `.env.example`

### Deferred (unchanged)

- [ ] A1: Repair mode Phase 3 — heavy adapters
- [ ] L3: Human feedback UI
