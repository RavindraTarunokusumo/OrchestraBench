# OrchestraBench MVP Decomposition Spec

## Scope

Implement the full MVP described in `SPEC.md` as five integrated milestones for a code review and bug-finding benchmarker. The result is a usable Next.js application that can submit benchmark tasks, execute orchestration workflows, persist traces and metrics, evaluate results, compare workflow value, and rerun saved datasets.

This document is intentionally a brief product/technical specification, not an implementation plan.

## Product Requirements

### Milestone 1: Baseline Runner

- Users can submit a code review task with title, language, code/context, workflow choice, and optional cost limit.
- The app supports `single_cheap` and `single_strong` workflows.
- Each workflow creates a run, records model calls, stores final output, and exposes a run detail page.
- The system can run without real provider credentials by using a deterministic mock provider; real OpenRouter execution is enabled when credentials are configured.

### Milestone 2: Panel + Judge

- Users can select `panel_judge`.
- Three reviewer calls execute independently.
- A judge call compares claims, contradictions, missing points, and consensus.
- The final run output includes synthesized findings, judge notes, confidence, and full call trace.

### Milestone 3: Cheap-First Escalation

- Users can select `cheap_first`.
- The cheap model reviews first, then a verifier grades confidence.
- If verifier confidence is below threshold or the answer violates the cost/quality constraints, the workflow escalates to a strong model.
- Run detail clearly shows whether escalation happened and why.

### Milestone 4: Evaluation Dashboard

- The app stores structured evaluation metrics: true positives, false positives, missed known bugs, high-severity true positives, quality score, value score, cost, latency, model-call count, judge confidence, and user rating.
- Users can record simple human feedback on a run.
- A comparison dashboard ranks workflows by quality, cost, latency, and value score.

### Milestone 5: Dataset Mode

- Users can create and view benchmark tasks with seeded known bugs.
- Users can rerun a dataset task across one or more workflows.
- The app includes starter seeded examples for code review evaluation.
- Users can export run and evaluation data as JSON.

## Data Model Requirements

Core persisted entities:

- `BenchmarkTask`: title, language, prompt/context, code, known bugs, tags, timestamps.
- `Run`: task input snapshot, optional benchmark task link, workflow, status, cost limit, started/completed timestamps, final answer, failure notes.
- `ModelCall`: run link, role, provider, model, prompt/messages snapshot, response, token counts, estimated cost, latency, error.
- `Finding`: run link, title, description, severity, file/line when available, confidence, source role, true/false-positive state.
- `Evaluation`: run link, TP/FP/missed counts, severity-weighted score, value score, judge confidence, user rating, notes.

## Interface Requirements

- Pages:
  - `/`: redirect or link to new run.
  - `/runs/new`: task submission form.
  - `/runs/[id]`: final answer, findings, trace, judge/evaluation notes, cost/latency, feedback controls.
  - `/dashboard`: workflow comparison dashboard.
  - `/datasets`: benchmark task list and creation.
  - `/datasets/[id]`: task detail, known bugs, rerun controls, related runs.
- API boundaries:
  - Create run.
  - Execute or trigger workflow.
  - Read run details.
  - Submit feedback/evaluation.
  - Create/list/read dataset tasks.
  - Export results.
- Provider boundary:
  - A single model-provider interface returns text, usage, estimated cost, latency, and errors.
  - Mock and OpenRouter implementations share the same interface.

## Workflow Requirements

- All workflows produce the same normalized run shape: status, final answer, findings, model calls, evaluation, cost, latency.
- Workflow execution must be idempotent enough that a failed run stores failure notes instead of leaving ambiguous state.
- Inngest is the target background workflow engine. For the local MVP, execution may use a direct server-side runner if it preserves the same workflow boundary and can later move behind Inngest without changing UI contracts.

## Edge Cases

- Missing OpenRouter credentials falls back to mock execution with a visible provider label.
- Empty code/task input is rejected before run creation.
- Cost limits prevent optional escalation or additional panel calls when the projected workflow exceeds the limit.
- Provider failure marks the model call failed and the run failed or partially completed, depending on whether a final answer can still be synthesized.
- Evaluation avoids divide-by-zero by using `max(cost_usd, 0.0001)` for value score.
- Dataset reruns snapshot task content so later edits do not mutate historical run inputs.

## Success Criteria

- The app can answer the five SPEC questions by comparing stored runs.
- Each workflow has traceable model calls, costs, latency, and outputs.
- Dataset mode supports repeatable comparisons across workflows.
- Mock mode works in local development and tests without external services.
- Real OpenRouter mode is isolated behind configuration and provider boundaries.

## Constraints

- Keep the MVP small: internal logging and simple UI first; no Braintrust, LangSmith, OpenTelemetry, auth, billing, or team features.
- Prefer typed TypeScript/Zod boundaries for workflow inputs and outputs.
- Use Prisma/PostgreSQL as the persistence target; local development may use the simplest Prisma-supported database setup if documented.
- Keep each milestone independently reviewable, but shared schema and provider contracts are common foundations.
- Parallel implementation agents may work on independent surfaces after shared foundations are established; shared schema, provider contracts, and generated types must not be edited concurrently.
