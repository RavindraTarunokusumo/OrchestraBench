# TODO.md

This file contains active or future work only.

Completed sessions are archived under `docs/iterations/archive/`:
- `2026-06-27-benchmark-repair-mode-phase1.md` — code-repair pivot (PR #3, merge `f9c80d2`).
- `earlier-sessions-mvp-and-ui-overhaul.md` — MVP milestones + UI overhaul (PR #2).

## Active / Next

- [ ] Repair mode — finish proving Phase 1 end-to-end
  - [ ] Verify the `QUIXBUGS_COMMIT` pin in `scripts/ingest-benchmark.ts` against the live repo before the first real `npm run ingest:quixbugs` (currently unverified).
  - [ ] Live E2B verification once `E2B_API_KEY` is set: run a QuixBugs task end-to-end (model → extract → sandbox pytest → resolved) and confirm the headline path works.
- [ ] Repair mode — Phase 2: fully repurpose the dashboard/datasets to repair metrics (resolve-rate vs cost comparison across workflows), replacing the Phase-1 guards/placeholders.
  - Spec: `docs/superpowers/specs/2026-06-27-repair-mode-phase2-dashboard-datasets.md`; Plan: `docs/superpowers/plans/2026-06-27-repair-mode-phase2-dashboard-datasets.md`. Presentation/aggregation only — no domain/store/runner/evaluation/API changes.
  - [x] T1: `lib/dashboard/aggregate.ts` — `summarizeByWorkflow` / `chartableSummaries` / `WorkflowSummary` + unit tests (gating; shared contract). Tests live in `tests/dashboard-aggregate.test.ts` (project convention; `vitest.config` only discovers `tests/**`).
  - [x] T3: rewrite `components/dashboard/workflow-charts.tsx` to repair metrics — `ResolveRateVsCost` scatter + `ValueLeaderboard`; drop the review-era `quality` series/`WorkflowChartRow`.
  - [x] T2: wire `app/dashboard/page.tsx` to the aggregator (table parity) and replace the "full view in Phase 2" placeholder card with `<WorkflowCharts>`.
  - [x] T4: `app/datasets/[id]/page.tsx` — per-task cross-workflow comparison from `summarizeByWorkflow(relatedRuns)`.
  - [ ] T5: `app/datasets/page.tsx` — repair-first list columns.
  - [ ] T6: `app/page.tsx` — correct "code review" copy to repair framing.
- [ ] Repair mode — Phase 3: heavy adapters (Defects4J or SWE-bench Lite) with repo checkout in the sandbox; Vercel Sandbox executor adapter; multi-language (Java) execution.
- [ ] Dedicated `/workflows` guide page (deferred from the UI overhaul).

## Future Backlog

- file-store cross-process write race: `writeData` uses a temp-file rename guarded only by an in-process `mutationQueue`, so concurrent processes (e.g. parallel Vitest workers) can hit EPERM on Windows. Tests currently run with `fileParallelism: false`; consider per-process data dirs or atomic-write hardening if Windows CI parallelism is reintroduced.
- `OrchestrationCanvas` GSAP effect depends on the whole `nodeStates` object, so the `gsap.context` is reverted/rebuilt (incl. `querySelectorAll` + `getTotalLength` forced reflow) on every stream event, restarting active-node pulses. Narrow to a per-node tween model keyed on status/flowing signature so unrelated nodes don't re-pulse. (Code-review medium, deferred.)
- Centralize SSE wire framing: the `data: …\n\n` encoder in `app/api/runs/stream/route.ts` and the `parseSseChunk` decoder in `use-run-stream.ts` are independent literals. Extract a shared `encode/decode` module. (Code-review medium, deferred.)
- Add a shared `formatCostUsd`/score formatter (lib/utils) — formatting is duplicated across home, dashboard, new-run, and run-detail. (Code-review medium, deferred.)
- Validate `entryPoint` as a Python identifier (`^[A-Za-z_][A-Za-z0-9_]*$`) in `createRunSchema` — API-supplied `entryPoint` flows into `from ${moduleName} import *` and the `${module}.py` filename in `lib/execution/e2b.ts`; a newline/malformed value can run module-level Python before pytest (sandbox-only) or break the harness. Not a host vuln (E2B is the trust boundary; security review PR #3 ruled it out) but cheap robustness hardening.

### Deferred from PR #3 bundled code review (Phase 2 / low value now)

- (#4) Legacy persisted runs (old `findings`/`qualityScore` shape, no `execution`) crash `app/runs/[id]/page.tsx`. Add a load-time normalizer in `readData` or a "legacy run" fallback panel. Affects only pre-existing local `.data` (gitignored).
- (#5) Live "Candidate fix" preview in `new-run-client.tsx` derives from the longest node `responsePreview`, not the final answer; multi-step workflows can show an intermediate snippet. Surface `candidateCode` on the `execution-result`/`run-final` SSE event instead.
- (#8) Mock provider returns review prose, not code, so local dev without `E2B_API_KEY` never exercises real extraction→execution. Make `buildMockText` emit a fenced code block for non-verifier roles.
- (#9) `parsePytest` in `lib/execution/e2b.ts` is binary (0 or all); `scoreExecution` supports partial credit. Parse pytest's passed/failed summary for partial counts.
- (#10) `latencyMs` excludes `execution.durationMs`; repair-run latency under-reports end-to-end time. Add execution duration or expose a separate `executionMs` across API/events/UI.
- (#13) `createRunSchema` lacks a repair-mode `.refine()` ("either `testCode` or resolvable `benchmarkTaskId`"); invalid inputs fail later with a generic error.
- (#14) `planner_worker_verifier` intermediate prompts (planner/worker/verifier) still ask for prose reviews; only the finalizer uses the repair prompt. Align intermediate prompts to code-fix reasoning (nit; works today).

## Long-Term Backlog

- Add evaluation harness (Braintrust/LangSmith/etc.)
- Export results
- Human feedback UI
- Cost/latency budgets per workflow
