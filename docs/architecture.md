# Architecture

OrchestraBench is a small Next.js App Router application for running code-review benchmark tasks through multiple orchestration workflows and comparing cost, latency, trace, and evaluation metrics.

## Runtime Flow

```text
User submits form
  -> app/actions.ts validates input with Zod
  -> lib/store/file-store.ts creates or updates records
  -> lib/workflows/runner.ts executes the selected workflow
  -> lib/providers/provider.ts selects mock or OpenRouter provider
  -> normalized RunResult is written to .data/orchestrabench.json
  -> route pages read the file store and render results
```

The MVP runner is synchronous. Inngest is the intended future background workflow boundary, but it is not wired into the current scaffold.

## App Routes

- `/` redirects to `/runs/new`.
- `/runs/new` submits a single benchmark run.
- `/runs/[id]` shows final answer, findings, evaluation, feedback controls, and model-call trace.
- `/dashboard` summarizes runs per workflow by average quality, value, cost, and latency.
- `/datasets` lists seeded/saved benchmark tasks and creates new ones.
- `/datasets/[id]` shows a dataset task and reruns selected workflows.
- `/api/export` returns the current file-store payload as JSON.

## Core Modules

- `lib/domain/types.ts` defines the normalized workflow, run, finding, model-call, evaluation, and dataset types.
- `lib/workflows/runner.ts` validates inputs, executes workflow-specific model-call sequences, synthesizes findings, and computes evaluation metrics.
- `lib/store/file-store.ts` owns local persistence, seeded datasets, run creation, feedback updates, dataset creation, reruns, and export.
- `lib/providers/types.ts` defines the provider interface and call trace conversion.
- `lib/providers/mock-provider.ts` returns deterministic responses for local development and tests.
- `lib/providers/openrouter-provider.ts` calls OpenRouter chat completions when credentials are configured.
- `lib/evaluation/metrics.ts` implements the SPEC quality/value score formula.

## Workflows

- `single_cheap`: one cheap reviewer call.
- `single_strong`: one strong reviewer call.
- `panel_judge`: three cheap panelist calls followed by a judge synthesis call.
- `cheap_first`: cheap reviewer, verifier confidence check, and optional strong-model escalation if confidence is below `0.6` and the cost limit allows it.
- `planner_worker_verifier`: planner, worker, verifier, and finalizer calls.

Every workflow returns the same `RunResult` shape: status, final answer, findings, model calls, evaluation, total cost, latency, timestamps, and optional escalation metadata.

## Provider Selection

`createConfiguredProvider()` uses OpenRouter only when `OPENROUTER_API_KEY` is present. Otherwise it falls back to the mock provider. The cheap model defaults to `cohere/north-mini-code:free`; the strong model defaults to `openai/gpt-4o-mini` and can be overridden with `OPENROUTER_STRONG_MODEL`.

## Current Constraints

- Runs are persisted after the workflow completes; partial provider failures are not yet captured as durable partial runs.
- Findings are currently synthesized deterministically from the final answer rather than parsed from structured model output.
- Prisma is present as the target schema, but runtime persistence still uses the local file store.
