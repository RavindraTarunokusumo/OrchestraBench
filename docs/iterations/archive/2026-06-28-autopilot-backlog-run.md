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
