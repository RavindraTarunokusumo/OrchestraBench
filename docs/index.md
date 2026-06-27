# OrchestraBench Docs

OrchestraBench is a Next.js MVP for benchmarking code-repair workflows across different model orchestration strategies: each workflow emits a fix that is run against the task's tests in a sandbox, and runs are scored on whether the tests pass. The current implementation is intentionally local-first: runs execute synchronously, persist to a JSON file, and can use either a deterministic mock provider or OpenRouter (and a mock or E2B sandbox executor).

## Core Documents

- [Architecture](architecture.md): App routes, workflow runner, provider boundary, and data flow.
- [Database / Persistence](database.md): Current file-store format and the Prisma/PostgreSQL target schema.
- [Patterns](patterns.md): Local implementation conventions and workflow invariants.
- [Testing](testing.md): Test coverage, validation commands, and what the current tests do not cover.
- [Commands](commands.md): Local setup, development, validation, and data reset commands.
- [Agent Harness](agent-harness.md): Expected workflow for agents working in this repo.
- [Insights](insights.md): Workflow/tooling observations that are not feature-specific.

## Implementation Snapshot

- App: Next.js App Router with React server components and server actions.
- Domain: Code-repair benchmarks (workflows emit a fix; tests decide pass/fail). QuixBugs is the first ingested source.
- Workflows: `single_cheap`, `single_strong`, `panel_judge`, `cheap_first`, and `planner_worker_verifier`.
- Persistence now: `.data/orchestrabench.json` via `lib/store/file-store.ts`.
- Persistence target: Prisma models in `prisma/schema.prisma` for PostgreSQL.
- Providers: deterministic mock provider by default; OpenRouter when `OPENROUTER_API_KEY` is set.
- Execution: mock sandbox executor by default; E2B when `E2B_API_KEY` is set (`lib/execution/`).
- Evaluation: test-execution based — resolved + partial credit + value score from `lib/evaluation/score-execution.ts`.

## Source Of Truth

Use source files as the final authority when docs and code drift:

- Domain types: `lib/domain/types.ts`
- Workflow execution: `lib/workflows/runner.ts`
- Persistence: `lib/store/file-store.ts`
- Provider boundary: `lib/providers/`
- UI routes: `app/`
- Tests: `tests/`
