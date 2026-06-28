# TODO.md

This file contains active or future work only.

Completed sessions are archived under `docs/iterations/archive/`:
- `2026-06-28-autopilot-backlog-run.md` — Autopilot run over the backlog (in progress): cycle 0 Autopilot doc (PR #7, merge `e62d4d5`); cycle 1 repair-run input validation (PR #8, merge `6c23367`); cycle 2 execution scoring & latency (PR #9, merge `75c9389`); cycle 3 local-dev & legacy-data robustness (PR #10, merge `2b4cee3`); cycle 4 shared formatters & SSE framing (PR #11, merge `56fdad1`).
- `2026-06-27-repair-mode-phase1-e2e-verification.md` — QuixBugs pin fix + live E2B end-to-end proof (PR #6, merge `2d8526d`).
- `2026-06-27-repair-mode-phase2-dashboard-datasets.md` — dashboard/datasets repair-metrics repurpose (PR #5, merge `c3be558`).
- `2026-06-27-benchmark-repair-mode-phase1.md` — code-repair pivot (PR #3, merge `f9c80d2`).
- `earlier-sessions-mvp-and-ui-overhaul.md` — MVP milestones + UI overhaul (PR #2).

## Autopilot Run — Backlog (started 2026-06-28)

Autonomous run over the whole backlog. Recorded decisions: cohesive small fixes are batched into themed cycles (each a reviewable PR; every sub-item still its own commit per Workflow Rule 1); minor single-concern patches (≤2 files, no new module) are implemented directly with the full verification gate; substantive cycles (new modules/pages, cross-cutting behavior) are delegated to Grok per the handoff. Mega-features needing external infra/accounts are spec'd with implementation deferred.

- [ ] **Cycle 5 — Candidate-fix surfacing & repair prompts**
  - [ ] D5: surface `candidateCode` on the `execution-result`/`run-final` SSE event; new-run "Candidate fix" preview should use the final answer, not the longest node `responsePreview`.
  - [ ] D14: align `planner_worker_verifier` intermediate prompts (planner/worker/verifier) to code-fix reasoning (only the finalizer uses the repair prompt today; nit).

- [ ] **Cycle 6 — File-store atomic-write hardening** (F1) — `writeData` uses a temp-file rename guarded only by an in-process `mutationQueue`; concurrent processes (parallel Vitest workers) hit EPERM on Windows. Tests run with `fileParallelism: false`; harden atomic write or use per-process data dirs to allow Windows parallelism.

- [ ] **Cycle 7 — OrchestrationCanvas per-node tween** (F2) — the GSAP effect depends on the whole `nodeStates` object, so the context is reverted/rebuilt (incl. `querySelectorAll` + `getTotalLength` reflow) on every stream event, restarting pulses. Narrow to a per-node tween model keyed on status/flowing signature.

- [ ] **Cycle 8 — `/workflows` guide page** (A2) — dedicated page, deferred from the UI overhaul.

- [ ] **Cycle 9 — Export results** (L2) — verify/extend the existing `/api/export`; add a UI export affordance.

- [ ] **Cycle 10 — Cost/latency budgets per workflow** (L4).

### Specs only (implementation deferred — external infra / accounts / large design)

- [ ] A1: Repair mode Phase 3 — heavy adapters (Defects4J / SWE-bench Lite) with repo checkout in the sandbox; Vercel Sandbox executor adapter; multi-language (Java) execution.
- [ ] L1: Evaluation harness (Braintrust/LangSmith/etc.).
- [ ] L3: Human feedback UI.
