# Patterns

These patterns describe the current MVP implementation. Prefer them until a change intentionally replaces the local-first scaffold.

## Server Actions As Mutations

Form submissions go through `app/actions.ts`. Actions validate form data with Zod, call the file-store API, and redirect to the next page. Route components should read through store functions instead of parsing `.data` directly.

## Normalized Run Results

All workflows must return the same `RunResult` shape from `lib/domain/types.ts`. UI pages depend on this consistency for dashboard summaries, run detail rendering, feedback, dataset reruns, and export.

## Provider Boundary

Workflow code should call the `ModelProvider` interface, not provider-specific SDK code. `ModelProvider.complete()` returns text, usage, estimated cost, latency, provider, and model. Convert responses into persisted call traces with `toCallTrace()`.

## Mock-First Development

The mock provider is the default when no `OPENROUTER_API_KEY` is configured. Tests should prefer `createMockProvider()` so they are deterministic, fast, and independent of network access or model availability.

## Local Persistence Boundary

Use `lib/store/file-store.ts` for all local reads and writes. It is the compatibility layer that should later move behind Prisma without changing route/page contracts.

## Evaluation Formula

Quality and value scoring belong in `lib/evaluation/metrics.ts`:

```text
quality_score =
  true_positives * 3
  + high_severity_true_positives * 2
  - false_positives * 1.5
  - missed_known_bugs * 2

value_score = quality_score / max(cost_usd, 0.0001)
```

Keep this calculation centralized so dashboards, tests, and future database jobs agree.

## Scope Discipline

The MVP intentionally avoids authentication, teams, billing, external observability, and background workflow infrastructure. Add those only when they are part of an accepted spec and documented migration path.
