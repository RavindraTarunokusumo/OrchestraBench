# Insights

Workflow and tooling observations for future agent sessions. Keep this file free of feature-specific implementation details.

- The GitNexus index may lag behind worktree commits even when it does not emit a staleness warning. Use it for orientation, then verify current behavior by reading source files directly.
- PowerShell treats square brackets in paths as wildcard syntax. Use `Get-Content -LiteralPath` for files under dynamic route folders such as `app\runs\[id]\page.tsx`.
- `.github/git_notes_template.md` may be absent in early scaffold worktrees. When a task still requires a git note, attach a concise manual note with summary, validation, and concerns.
- `Get-ChildItem -Recurse .github` can wander into dependency package metadata when the root `.github` directory is absent. Prefer `Test-Path -LiteralPath .github` before recursive listing.
- Initial `npm install` in OneDrive-backed worktrees may time out and leave a partial `node_modules`; verify `package-lock.json` exists before trusting the install, and delete only the resolved local dependency tree before retrying.
- `gh pr create --json` is not supported by the installed GitHub CLI version. Use `gh pr create` first, then `gh pr view --json ...` to capture structured PR metadata.
- Grok review sessions may create untracked `mcps/` descriptor files and emit unrelated Vercel MCP auth warnings. Delete generated `mcps/` artifacts before committing and treat the auth warnings as review-tool noise unless the task uses Vercel.
- `next lint` currently works after adding ESLint config but prints a deprecation warning. Future sessions should consider migrating the lint script to the ESLint CLI.
- Grok-as-implementer (Step 4) executes well *within* a task's scope (correct TDD, files, code matching the contract) but grades itself only against the test files named in its prompt. In this session it reported "25 tests pass" for a runner change that had broken the SSE route + 2 other tests; only the main agent's **full** `npm test` caught it. Always run the full suite + `tsc` + lint at the orchestrator level after each delegated task — never trust the scoped self-report.
- Grok consistently omits the trailing newline on every file it writes/edits, regardless of explicit instructions. Normalize newlines during review (`printf '\n' >> file` where `tail -c1` is non-empty) rather than relying on the prompt.
- The expensive part of planning is the cross-task contract (decomposition + per-task Interfaces + build order + "who else calls this signature"), not the verbatim per-step code. A narrowly-scoped implementer structurally cannot derive that contract. Keep a **lightweight** plan (contract skeleton) and let the implementer regenerate code/commands — this retains the spec→plan→implementation verification chain at lower cost.
- The `next/no-assign-module-variable` ESLint rule rejects a local variable named `module`; the gated/typecheck steps pass but lint fails. Avoid `module` as an identifier (use `moduleName` etc.).
