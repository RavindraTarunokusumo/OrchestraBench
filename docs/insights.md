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
