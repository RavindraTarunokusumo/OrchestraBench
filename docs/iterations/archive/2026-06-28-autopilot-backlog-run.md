# Autopilot Backlog Run (archived, in progress)

Autonomous run over the TODO backlog (Autopilot mode). Each cycle is its own branch/PR/review/merge; cohesive small fixes are batched into themed cycles, each sub-fix its own commit. Cycles are appended here as they merge.

## Cycle 0 — Autopilot Mode doc

- Merged: PR #7 → `main` as merge commit `e62d4d5` (2026-06-28)
- Type: docs (workflow)

Added the `### Autopilot Mode` section to `CLAUDE.md`/`AGENTS.md`: autonomous full-Workflow runs (no user approval gates), one independent cycle per feature, verification rails preserved.

## Cycle 1 — Repair-run input validation (F5, D13)

- Merged: PR #8 → `main` as merge commit `6c23367` (2026-06-28)
- Type: feature / minor patch (no spec; implemented directly with the full gate)

Hardened `createRunSchema` for code-repair runs.

### Tasks (commit-tagged)

- [x] F5 — `entryPoint` must be a valid Python identifier; reserved keywords rejected. (fb7704e, dace93e)
  - The value flows into `from <module> import *` and the `<module>.py` filename in `lib/execution/e2b.ts`. The regex `^[A-Za-z_][A-Za-z0-9_]*$` blocks injection shapes; a keyword denylist (added on review) blocks `class`/`import`/… that pass the regex but break the import at runtime. Sandbox-only hardening — E2B is the trust boundary (PR #3 security review ruled out a host vuln).
- [x] D13 — `createRunSchema` refines to require `testCode` or `benchmarkTaskId`. (fb7704e, dace93e)
  - Runs with neither now fail at parse with a clear top-level message instead of later with a generic error. Resolvability of `benchmarkTaskId` stays a runtime concern in `resolveRunInput`/the route.
- [x] (mod) Numeric-coercion contract test now supplies a `benchmarkTaskId` to stay valid under the refine. (fb7704e)

### Review

Grok bundled review (PENDING posted, ephemeral session cleaned up). 1 bug + 2 suggestions, all addressed in `dace93e`: keyword denylist, top-level refine path, added keyword + message tests.

### Validation

`npm run typecheck` clean, `npm run lint` clean (pre-existing next-lint deprecation only), `npm test` 84 passed / 1 skipped (+5 contract tests vs the 79 baseline).

## Cycle 2 — Execution scoring & latency fidelity (D9, D10)

- Merged: PR #9 → `main` as merge commit `75c9389` (2026-06-28)
- Type: enhancement (Grok-implemented, orchestrator-validated)

### Tasks (commit-tagged)

- [x] D9 — partial pytest credit in `lib/execution/e2b.ts`. (368e5be, 46ef612)
  - Each `assert` line becomes its own pytest test function (multi-line asserts span via bracket-depth tracking; non-assert lines kept as module-level preamble), so pytest counts asserts individually. `parsePytest` parses passed/failed/error counts from the last summary line and floors the denominator to `assertCount` (collection errors / "0 passed" report 0/N). `buildPytestFile`/`parsePytest` exported and unit-tested without E2B.
- [x] D10 — surface execution duration. (410ae34, 46ef612)
  - `executionMs` added to the `run-final` event (from `execution.durationMs`), threaded through `use-run-stream`; home cards and the live summary show "model · exec" timing. `RunResult.latencyMs` semantics unchanged.

### Review

Grok bundled review (PENDING posted, session cleaned up). 4 bugs + 3 suggestions + 1 nit; 6 addressed in `46ef612` (denominator flooring, last-line parsing, multi-line asserts, "Timing" label), 2 declined with reasoning (skipped-test parsing — our harness never skips; pre-run-final exec timing — nit).

### Validation

`npm run typecheck` clean, `npm run lint` clean, `npm test` 93 passed / 1 skipped.

### Follow-up

- The home card now reads `run.execution.durationMs`; cycle 3 (D4 legacy normalizer) must cover this access for pre-pivot local runs that lack `execution`. (Done in cycle 3.)

## Cycle 3 — Local-dev & legacy-data robustness (D8, D4)

- Merged: PR #10 → `main` as merge commit `2b4cee3` (2026-06-28)
- Type: enhancement / robustness (Grok-implemented, orchestrator-validated)

### Tasks (commit-tagged)

- [x] D8 — mock provider emits runnable code. (830b8ff, 3cabd46)
  - Non-verifier roles now return a ```python``` block whose body is `extractMockCandidate(prompt)` (the code after the first `Buggy code:` label, else the largest embedded fenced block via `extractCode`, else a stub), so local dev without an E2B key exercises extraction→execution. Verifier still returns confidence JSON.
- [x] D4 — normalize legacy persisted runs. (8718824, 3cabd46)
  - `readData` maps loaded runs through a pure `normalizeRun` that spreads safe defaults into `execution`/`evaluation` (handles wholly- and partially-missing nested objects) and fills `candidateCode`/`finalAnswer`/`calls`/`costUsd`/`latencyMs`, fixing crashes on the run-detail and home pages for pre-pivot local `.data` (gitignored).

### Review

Grok bundled review (PENDING posted, session cleaned up). 2 bugs + 1 suggestion, all addressed in `3cabd46`: first-occurrence label (`indexOf`), deep-merge normalization for partial nested fields, and largest-fenced-block alignment via `extractCode`.

### Validation

`npm run typecheck` clean, `npm run lint` clean, `npm test` 99 passed / 1 skipped.

## Cycle 4 — Shared utilities & SSE wire framing (F4, F3)

- Merged: PR #11 → `main` as merge commit `56fdad1` (2026-06-28)
- Type: refactor / dedupe (Grok-implemented, orchestrator-validated)

### Tasks (commit-tagged)

- [x] F4 — shared cost/score formatters. (40d5e6e)
  - `formatCostUsd` / `formatScore` added to `lib/utils.ts`; inline `$${n.toFixed(4)}` and `valueScore.toFixed(1)` deduped across home, dashboard, datasets, run-detail, new-run, and the orchestration canvas/node. New-run value score standardized to one decimal. Specialized formatters (chart-axis tick, percentages, cost math, verifier confidence) left untouched.
- [x] F3 — shared SSE wire framing. (5e7add3)
  - Extracted `lib/workflows/sse.ts` (`encodeSseEvent` + `parseSseChunk` sharing `SSE_DATA_PREFIX`/`SSE_DELIMITER`); the stream route encodes via `encodeSseEvent` and `use-run-stream` imports `parseSseChunk` (no re-export shim; test import updated). Round-trip test added.

### Review

Grok bundled review (PENDING posted, session cleaned up). 1 bug + 2 suggestions, all resolved by reasoning without code changes: (1) new-run score 2→1 decimal is the intended standardization F4 unifies on — kept; (2) the canvas HUD now shows `$` — that is a fix (the old `Cost ${…}` swallowed the `$` into the interpolation); (3) `parseSseChunk`'s unguarded `JSON.parse` is pre-existing and frames are self-produced via `JSON.stringify`, so a malformed complete frame can't occur — out of scope for a pure refactor.

### Validation

`npm run typecheck` clean, `npm run lint` clean, `npm test` 105 passed / 1 skipped (one flaky file-store-race failure on first run; clean on re-run — root cause is F1, cycle 6).

### Note

The dedicated `agitated-volhard-b5e234` worktree was deleted by OneDrive mid-cycle-4 (after the F4/F3 commits, before push). The branch + commits + git notes survived in the shared git dir; the run resumed in the primary checkout. Remaining cycles run on feature branches in the primary checkout (sequential), avoiding new OneDrive worktrees.

## Cycle 5 — Candidate-fix surfacing & repair prompts (D5, D14)

- Merged: PR #12 → `main` as merge commit `436de93` (2026-06-28)
- Type: enhancement (Grok-implemented, orchestrator-validated)

### Tasks (commit-tagged)

- [x] D5 — surface the real candidate fix. (cad0385)
  - `candidateCode` added to the `run-final` event (from `saved.candidateCode`), threaded through `use-run-stream`; the new-run "Candidate fix" panel renders `finalSummary.candidateCode`, dropping the truncated longest-`responsePreview` heuristic and its `extractCode`/`useMemo`.
- [x] D14 — repair-oriented planner_worker_verifier prompts. (7a1cfc3, c6d736c)
  - Reworded planner/worker/verifier from prose code-review to code-fix reasoning. Review follow-up (Rule 2 scope extension): the finalizer previously called `buildRepairPrompt(input)` alone — the worker/verifier output never reached the answer. The finalizer now incorporates the worker fix + verifier critique (buildRepairPrompt kept last so the `Buggy code:` section stays terminal); the verifier critiques against the original code/tests; the worker returns a code block. Test asserts the finalizer consumes the worker output.

### Review

Grok bundled review (PENDING posted, session cleaned up). Found the finalizer-chain disconnect (fixed in `c6d736c`); the "no live candidate preview" note was declined (the panel only renders at terminal).

### Validation

`npm run typecheck` clean, `npm run lint` clean, `npm test` 106 passed / 1 skipped.

## Cycle 6 — File-store atomic-write hardening (F1)

- Merged: PR #13 → `main` as merge commit `4ec6237` (2026-06-28)
- Type: robustness / test-infra (Grok-implemented, orchestrator-validated)

### Tasks (commit-tagged)

- [x] F1 — atomic-write hardening + parallel-safe test dirs. (8201cbc + review fix in the same PR)
  - `DATA_DIR` honors `ORCHESTRABENCH_DATA_DIR` (resolved) else `.data`; `writeData` renames via `renameWithRetry` (retries EPERM/EACCES/EBUSY/EEXIST with short backoff, unlinks the temp file on terminal failure). A vitest setup file gives each worker its own `os.tmpdir()` data dir (off the OneDrive tree), so `fileParallelism` is re-enabled and isolated. Suite ~7s → ~2.3s, stable across repeated runs.

### Review

Grok bundled review (PENDING posted, session cleaned up). 1 bug + 3 suggestions + 1 nit. Addressed: temp-file cleanup on rename failure; a comment clarifying `renameWithRetry` prevents the contention *crash* but not cross-process lost updates (in-process `mutationQueue` only); a test asserting the `ORCHESTRABENCH_DATA_DIR` override is honored. Declined: a spawned cross-process race test (slow/flaky — the parallel suite is the proof) and per-worker tmp-dir teardown (OS-managed, negligible).

### Validation

`npm run typecheck` clean, `npm run lint` clean, `npm test` 108 passed / 1 skipped under parallelism.

## Cycle 7 — OrchestrationCanvas tween signature (F2)

- Merged: PR #14 → `main` as merge commit `17bdbd8` (2026-06-28)
- Type: perf (implemented directly — minor patch, 1 file)

### Tasks (commit-tagged)

- [x] F2 — rebuild the GSAP context only on active/flowing changes. (239af07)
  - The canvas `useLayoutEffect` depended on the whole `nodeStates`, so every stream event reverted/rebuilt the GSAP context (re-querying rings, `getTotalLength` reflow), restarting pulses. The effect is now keyed on a derived `animationSignature` (active node ids + flowing edge keys); the effect body is unchanged, so non-active-set updates (preview/cost/total) no longer churn the animation.

### Review

Grok bundled review (PENDING posted, session cleaned up). 0 bugs; 1 suggestion + 1 nit, both declined with reasoning: the `nodeStates` memo dep is required by `exhaustive-deps` (the body reads it), and the once-resolved theme color is pre-existing.

### Validation

`npm run typecheck` clean, `npm run lint` clean, `npm test` 108 passed / 1 skipped, `npm run build` OK. (Canvas has no unit tests; build + typecheck + lint are the gate.)

### Scope note

This eliminates the every-event churn the issue called out. Re-pulsing on actual node transitions still occurs — fully avoiding it needs a per-node tween lifecycle (persisting tweens across rebuilds), deferred as higher-risk/low-value for an untested animation surface.
