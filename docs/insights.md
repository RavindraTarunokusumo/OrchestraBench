# Insights

Workflow and tooling observations for future agent sessions. Keep this file free of feature-specific implementation details.

- The GitNexus index may lag behind worktree commits even when it does not emit a staleness warning. Use it for orientation, then verify current behavior by reading source files directly.
- PowerShell treats square brackets in paths as wildcard syntax. Use `Get-Content -LiteralPath` for files under dynamic route folders such as `app\runs\[id]\page.tsx`.
- `.github/git_notes_template.md` may be absent in early scaffold worktrees. When a task still requires a git note, attach a concise manual note with summary, validation, and concerns.
