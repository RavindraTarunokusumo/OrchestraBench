# TODO.md

This file contains active or future work only.

Completed sessions are archived under `docs/iterations/archive/`:
- `2026-06-27-repair-mode-phase1-e2e-verification.md` — QuixBugs pin fix + live E2B end-to-end proof (PR #6, merge `2d8526d`).
- `2026-06-27-repair-mode-phase2-dashboard-datasets.md` — dashboard/datasets repair-metrics repurpose (PR #5, merge `c3be558`).
- `2026-06-27-benchmark-repair-mode-phase1.md` — code-repair pivot (PR #3, merge `f9c80d2`).
- `earlier-sessions-mvp-and-ui-overhaul.md` — MVP milestones + UI overhaul (PR #2).

## Active / Next

- [ ] Repair mode — Phase 3: heavy adapters (Defects4J or SWE-bench Lite) with repo checkout in the sandbox; Vercel Sandbox executor adapter; multi-language (Java) execution.
- [ ] Dedicated `/workflows` guide page (deferred from the UI overhaul).

## Future Backlog

- file-store cross-process write race: `writeData` uses a temp-file rename guarded only by an in-process `mutationQueue`, so concurrent processes (e.g. parallel Vitest workers) can hit EPERM on Windows. Tests currently run with `fileParallelism: false`; consider per-process data dirs or atomic-write hardening if Windows CI parallelism is reintroduced.
- `OrchestrationCanvas` GSAP effect depends on the whole `nodeStates` object, so the `gsap.context` is reverted/rebuilt (incl. `querySelectorAll` + `getTotalLength` forced reflow) on every stream event, restarting active-node pulses. Narrow to a per-node tween model keyed on status/flowing signature so unrelated nodes don't re-pulse. (Code-review medium, deferred.)
- Centralize SSE wire framing: the `data: …\n\n` encoder in `app/api/runs/stream/route.ts` and the `parseSseChunk` decoder in `use-run-stream.ts` are independent literals. Extract a shared `encode/decode` module. (Code-review medium, deferred.)
- Add a shared `formatCostUsd`/score formatter (lib/utils) — formatting is duplicated across home, dashboard, new-run, and run-detail. (Code-review medium, deferred.)
- Validate `entryPoint` as a Python identifier (`^[A-Za-z_][A-Za-z0-9_]*$`) in `createRunSchema` — API-supplied `entryPoint` flows into `from ${moduleName} import *` and the `${module}.py` filename in `lib/execution/e2b.ts`; a newline/malformed value can run module-level Python before pytest (sandbox-only) or break the harness. Not a host vuln (E2B is the trust boundary; security review PR #3 ruled it out) but cheap robustness hardening.

### Deferred from PR #3 bundled code review (low value now)

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
