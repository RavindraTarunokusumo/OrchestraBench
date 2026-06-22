# Agent Harness

Agents working in this repo should follow `AGENTS.md` and the current user task scope. This document summarizes the practical expectations for the MVP scaffold.

## Session Start

- Work from the assigned branch/worktree.
- Run `git status --short --branch` before editing.
- Read `AGENTS.md`, `docs/index.md`, `docs/insights.md` when present, and any relevant technical docs.
- Use GitNexus or the available code graph before touching unfamiliar code. Treat stale graph data as orientation only and verify with direct source reads.

## Editing Rules

- Keep changes inside the requested scope.
- Do not revert or overwrite edits by other agents.
- Use specific staging paths; never use `git add -A`.
- Do not force-push, hard reset, merge, or amend unless explicitly asked.
- For code changes, run impact analysis before editing symbols and `gitnexus detect_changes` before committing when GitNexus is available.
- For docs-only changes, keep claims tied to current source files and avoid changing app code, tests, package files, schema, or TODO unless the task explicitly allows it.

## Validation

- Prefer `npm run typecheck` and `npm run lint` before committing.
- Run `npm test` when behavior, workflow, provider, metrics, store, route, or schema contracts change.
- If validation fails only because of unrelated pre-existing files, report the exact command and failure instead of broadening scope.

## Commits And Notes

- Commit focused changes with a concise message.
- Attach a git note after the commit summarizing validation. If `.github/git_notes_template.md` is missing, use a short note with summary, validation commands, and concerns.
- Leave unrelated untracked or modified files unstaged.

## Documentation Maintenance

- Update docs when behavior, architecture, commands, testing expectations, or persistence contracts change.
- Use `docs/insights.md` only for workflow/tooling observations, not feature-specific implementation notes.
