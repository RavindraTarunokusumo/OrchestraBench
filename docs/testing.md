# Testing

The current test suite uses Vitest in a Node environment. Tests live in `tests/**/*.test.ts` and import application modules through the `@/` alias configured in `vitest.config.ts`.

## Current Coverage

- `tests/metrics.test.ts` verifies the SPEC quality/value score formula, including the zero-cost denominator guard.
- `tests/workflows.test.ts` verifies that all five workflow kinds return normalized completed runs with mock provider output.
- `tests/workflows.test.ts` also covers cheap-first escalation when verifier confidence is low and the cost-limit path that prevents escalation.

## Recommended Commands

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Unit tests: `npm test`
- Watch mode: `npm run test:watch`

Docs-only changes should run typecheck and lint before finishing. Run `npm test` when workflow, metrics, provider, store, or route behavior changes.

## Test Data

The file store seeds dataset tasks when `.data/orchestrabench.json` does not exist or cannot be parsed. Unit tests for workflow and metrics do not depend on the file store; they call lower-level modules directly with deterministic inputs.

## Gaps

- No tests currently cover server actions, route rendering, file-store persistence, JSON export, or OpenRouter integration.
- No browser/e2e tests currently cover the new-run, dashboard, run-detail, dataset, or feedback flows.
- Provider failure and partial-run behavior are not yet covered.
