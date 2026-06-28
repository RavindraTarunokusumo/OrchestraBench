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
