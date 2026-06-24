# Task 6 — Home landing/overview page

Commit: `60cc60f` feat(home): replace redirect with landing/overview page

## Sections built (`app/page.tsx`, async Server Component, no `"use client"`)

1. **Hero** — "OrchestraBench" heading, one-paragraph tagline (adaptive multi-model
   orchestration benchmarker for code review; tests whether orchestration beats a
   single model under real cost/latency/quality constraints), primary CTA `Button`
   (`asChild` + `next/link`) → `/runs/new` ("New run"), plus secondary outline buttons
   → `/dashboard` and `/datasets`.
2. **Workflows** — maps `workflowKinds` (from `lib/domain/types.ts`) to a local
   `workflowCopy` record with friendly name + one-line description sourced from
   SPEC.md §"Main Workflows", rendered as a responsive grid of shadcn `Card`s
   (`CardHeader`/`CardTitle`/`CardContent`/`CardDescription`).
3. **Recent runs** — calls `listRuns()` (already sorted newest-first by the store),
   takes the first 5, and renders each as a `Card` linking to `/runs/${run.id}`
   showing title, workflow friendly name, a status `Badge`, quality/value score, and
   cost/latency. A "View all" ghost button appears next to the heading only when
   there are runs, linking to `/dashboard`.

## Empty state

When `listRuns()` returns `[]`, the recent-runs section renders a single centered
`Card` with the copy "No runs yet — start your first run." and a `Button` → `/runs/new`,
instead of the grid. This mirrors the acceptance criterion verbatim and reuses the same
CTA destination as the hero.

## Verification

- `npm run lint` — clean (no ESLint warnings/errors).
- `npm run typecheck` — clean (`tsc --noEmit`).
- `npm test` — 50/50 tests passed across 7 files (untouched by this change; confirms no
  regression).
- `npm run build` — succeeded. Route table confirms `/` is now `○ (Static)`
  (106 kB First Load JS) rather than a redirect target.

## Concerns

- None blocking. `app/dashboard/page.tsx` (Task 7, out of scope here) still uses legacy
  non-shadcn classes (`container`, `panel`, `card`, `muted`) rather than the shadcn
  components used on this new home page — that mismatch is expected per the plan's
  sequencing (Task 7 migrates the dashboard) and was left untouched.
- Status badge uses `variant="default"` for `completed` and `secondary` for everything
  else (`pending`/`running`/`failed`/`partial`) since the badge component has no
  semantic "success/destructive-lite" variant beyond `default/secondary/destructive/outline`;
  this is a minor visual simplification, not a logic concern.
