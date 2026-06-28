# TODO.md

This file contains active or future work only.

Completed sessions are archived under `docs/iterations/archive/`:
- `2026-06-27-repair-mode-phase1-e2e-verification.md` — QuixBugs pin fix + live E2B end-to-end proof (PR #6, merge `2d8526d`).
- `2026-06-27-repair-mode-phase2-dashboard-datasets.md` — dashboard/datasets repair-metrics repurpose (PR #5, merge `c3be558`).
- `2026-06-27-benchmark-repair-mode-phase1.md` — code-repair pivot (PR #3, merge `f9c80d2`).
- `earlier-sessions-mvp-and-ui-overhaul.md` — MVP milestones + UI overhaul (PR #2).

## Autopilot Run — Backlog (started 2026-06-28)

Autonomous run over the whole backlog. Recorded decisions: cohesive small fixes are batched into themed cycles (each a reviewable PR; every sub-item still its own commit per Workflow Rule 1); minor single-concern patches (≤2 files, no new module) are implemented directly with the full verification gate; substantive cycles (new modules/pages, cross-cutting behavior) are delegated to Grok per the handoff. Mega-features needing external infra/accounts are spec'd with implementation deferred.

- [ ] **Cycle 1 — Repair-run input validation** (`feat/repair-input-validation`)
  - [ ] F5: validate `entryPoint` as a Python identifier (`^[A-Za-z_][A-Za-z0-9_]*$`) in `createRunSchema` — flows into `from ${moduleName} import *` and `${module}.py` in `lib/execution/e2b.ts`. Sandbox-only (E2B is the trust boundary; security review PR #3 ruled out a host vuln) — cheap robustness hardening.
  - [ ] D13: add a repair-mode `.refine()` to `createRunSchema` — require `testCode` or `benchmarkTaskId` (today invalid inputs fail later with a generic error). Resolvability of the task is a runtime concern, not schema.
  - [ ] (mod, Rule 2) Update the `tests/api-contracts.test.ts` numeric-coercion test to supply a `benchmarkTaskId` so it stays valid under the new refine.

- [ ] **Cycle 2 — Execution scoring & latency fidelity**
  - [ ] D9: `parsePytest` partial credit — parse pytest's passed/failed summary instead of binary 0/all (`scoreExecution` already supports partials).
  - [ ] D10: include `execution.durationMs` in end-to-end latency, or expose a separate `executionMs` across API/events/UI (today `latencyMs` excludes it; repair runs under-report).

- [ ] **Cycle 3 — Local-dev & legacy-data robustness**
  - [ ] D8: mock provider emits a fenced code block for non-verifier roles so local dev (no `E2B_API_KEY`) exercises extraction→execution.
  - [ ] D4: legacy persisted runs normalizer (old `findings`/`qualityScore` shape, no `execution`) so `app/runs/[id]/page.tsx` doesn't crash. Affects only pre-existing local `.data` (gitignored).

- [ ] **Cycle 4 — Shared utilities & SSE wire framing**
  - [ ] F4: shared `formatCostUsd`/score formatter in `lib/utils`; dedupe across home, dashboard, new-run, run-detail.
  - [ ] F3: shared SSE `encode`/`decode` module (the `data: …\n\n` encoder in `app/api/runs/stream/route.ts` and the `parseSseChunk` decoder in `use-run-stream.ts` are independent literals).

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
