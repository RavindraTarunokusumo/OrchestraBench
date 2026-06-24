# Task 7 — Dashboard charts, loading/empty states, Run Detail static replay, datasets migration, legacy-CSS cleanup

Commits:
- `8e4b660` feat: migrate dashboard to shadcn with value-score and quality-cost charts
- `71663f6` feat: add loading skeletons for dashboard, datasets, and run detail
- `98f81f0` feat: add static orchestration replay to run detail page
- `fe7e58c` feat: migrate datasets pages to shadcn components
- `81e0569` chore: remove dead legacy CSS classes from globals.css
- `dee33d7` docs: check off Phase 7 in TODO.md

## A. Dashboard (`app/dashboard/page.tsx`)

Stayed an async Server Component. Migrated from legacy `.container/.panel/.table` markup
to shadcn `Card`/`Table`/`Badge`/`Button`. Existing `summarize()`/`avg()` aggregation
logic is unchanged; its output is reshaped into a small `WorkflowChartRow[]`
(`{ workflow, quality, value, cost }`, rounded) and passed as a plain-data prop to the
new client chart component — the page itself never becomes a client component.

`components/dashboard/workflow-charts.tsx` (`"use client"`) renders two `recharts`
`BarChart`s wrapped in `ChartContainer`/`ChartTooltip`/`ChartTooltipContent` from
`components/ui/chart.tsx`:
- **Value score leaderboard** — one bar per workflow, avg `valueScore`.
- **Quality vs. cost** — two bars per workflow (avg `qualityScore`, avg `costUsd`) for a
  side-by-side comparison.

Both use `ChartConfig` entries pointing at `var(--chart-1)`/`var(--chart-2)`/`var(--chart-4)`
so they track the existing light/dark oklch theme tokens with no new colors introduced.

Empty state: when `listRuns()` returns `[]`, the charts, comparison table, and recent-runs
grid are replaced by a single centered `Card` with "No runs yet — start a run to populate
the dashboard." and a `Button` → `/runs/new`.

Recent runs render as a `Card` grid (`sm:grid-cols-2 lg:grid-cols-3`) with a status `Badge`
instead of plain links.

## B. Loading skeletons

Added, all using `components/ui/skeleton.tsx`:
- `app/dashboard/loading.tsx` — title block, two `h-72` chart placeholders, one `h-64`
  table placeholder, three `h-32` recent-run card placeholders.
- `app/datasets/loading.tsx` — title block, saved-tasks column (3× `h-20`), form column
  (`h-96`).
- `app/runs/[id]/loading.tsx` — title block, 3 metric placeholders, `h-56` canvas
  placeholder, two `h-72` columns, one `h-48` trace placeholder.

Each mirrors its page's actual grid structure so the transition from skeleton to content
doesn't visibly reflow.

## C. Run Detail (`app/runs/[id]/page.tsx`)

Migrated to shadcn `Card`/`Badge`/`Button`/`Label`/`Select`/`Table`/`Textarea`. Added a
"Orchestration replay" `Card` rendering `<OrchestrationCanvas graph={graph} nodeStates={nodeStates} status={mapRunStatus(run.status)} mode="static" />`
directly above the final-answer/evaluation grid, where `graph = buildWorkflowGraph(run.workflow)`.

### `components/orchestration/derive-node-states.ts`

Pure helper, `deriveNodeStatesFromCalls(graph, run): Record<string, NodeState>`:
1. Buckets `run.calls` into a `Map<role, ModelCallTrace[]>` preserving call order.
2. Walks `graph.nodes` in graph order:
   - `input`/`router` nodes → always `{ status: "done" }`.
   - `result` node → `"done"` if `run.status === "completed"`, else `"failed"`.
   - All other nodes use their `node.role` to `.shift()` the next unused call of that role
     off the per-role queue (so `panelist-1`/`panelist-2`/`panelist-3` each consume calls
     left-to-right in call order). A matched call yields
     `{ status: call.error ? "failed" : "done", model, usage, costUsd: estimatedCostUsd, latencyMs, responsePreview: response.slice(0, 200) }`.
   - If no call remains for that role (e.g. `cheap_first`'s `strong_reviewer` when no
     escalation occurred), the node is simply omitted from the map — `OrchestrationCanvas`'s
     own `defaultNodeState()` fallback already renders missing entries as `pending`, so no
     explicit pending state needs to be set here.

Unit tested in `tests/derive-node-states.test.ts` (5 cases, all passing):
- `maps three panelist calls to panelist-1/2/3 in order, then the judge`
- `leaves strong_reviewer pending for cheap_first when no escalation happened`
- `marks strong_reviewer done for cheap_first when escalation happened`
- `marks a node failed when its matching call has an error`
- `maps the full planner_worker_verifier sequence`

The native human-rating `<select>` was replaced with shadcn `Select`. Radix `Select` does
not allow an empty-string `SelectItem` value (reserved for "no selection"), so the old
`<option value="">No rating</option>` became `<SelectValue placeholder="No rating" />`
instead, with `defaultValue={run.evaluation.userRating?.toString() ?? ""}` left unselected
when there's no existing rating. `name="userRating"` stayed on the `Select` so
`feedbackAction` form submission is unaffected. Findings `Table`, evaluation `Metric` grid,
and the model-call trace `<pre>` blocks were restyled (`bg-muted`) but functionally
untouched.

## D. Datasets (`app/datasets/page.tsx`, `app/datasets/[id]/page.tsx`)

Both migrated to shadcn `Card`/`Table`-equivalent layout/`Input`/`Label`/`Select`/`Textarea`/`Button`.
`createDatasetAction` and `rerunDatasetAction` wiring (field names, hidden inputs) is
unchanged. The bug-severity native `<select>` became a shadcn `Select`
(`name="knownBugSeverity" defaultValue="medium"`). Workflow-selection checkboxes on the
detail page stayed native `<input type="checkbox">` (no shadcn Checkbox primitive exists
in `components/ui/`), wrapped in a Tailwind-styled `<label>`.

Empty states added: "No datasets yet." (datasets list) and "No reruns yet." (related runs
on the detail page).

## E. Legacy CSS cleanup (`app/globals.css`)

Verified via repo-wide exact-token searches across `app/` and `components/` that, after
A–D above, every legacy bespoke class had zero remaining references except `.shell`
(still used by `app/layout.tsx`: `<div className="shell">{children}</div>`).

**Removed** (all confirmed dead): `.topbar`, `.brand`, `.nav`/`.nav a`, `.button`/`.button.primary`/`.button.danger`,
`.container`, `.page-title` (+ `h1`/`p` children), `.grid`/`.grid.two`/`.grid.three`,
`.panel`/`.card`, `.stack`, `.form-grid`, `.field` (+ children), `.code`,
`.metric-row`/`.trace-row`, `.metric` (+ `strong`), `.muted`, `.badge`/`.badge.warning`,
`.table` (+ `th`/`td`), `.checkbox-grid`, `.checkbox`, the entire legacy `:root` color
block (`--bg`, `--panel`, `--panel-muted`, `--text`, `--muted-legacy`, `--line`,
`--accent-legacy`, `--accent-strong`, `--danger`, `--warning` — only referenced inside the
now-dead rules above), and the `@media (max-width: 820px)` block (only targeted dead
selectors).

**Kept**: `.shell { min-height: 100vh; }` — still actively referenced in `app/layout.tsx`.

This was the last page group still on the legacy classes (dashboard, run detail, datasets
were the only consumers per the Task 1 migration note), so the whole legacy section
collapsed to just the one surviving rule.

## Chart implementation note (recharts/shadcn type friction)

`components/ui/chart.tsx`'s `ChartTooltipContent` types its props against locally defined
`ChartValueType`/`ChartNameType` aliases that don't structurally match recharts 3.9.0's own
`ValueType`/`NameType` generics (readonly-array vs array, differing `Formatter` parameter
variance) — a version-skew issue in that pre-existing boilerplate file, which was left
untouched per scope. Fixed at the call site in `workflow-charts.tsx` by casting
`ChartTooltipContent` through the consuming `ChartTooltip` component's own inferred
`content` prop type:

```tsx
const renderTooltip = ChartTooltipContent as unknown as React.ComponentProps<typeof ChartTooltip>["content"];
```

This sidesteps pinning to either side's specific generic parameters and typechecks cleanly.

## Verification (final, post all 5 commits)

- `npm run lint` — clean, no ESLint warnings/errors.
- `npm run typecheck` — clean (`tsc --noEmit`).
- `npm test` — **55/55 passed** across 8 files (50 pre-existing + 5 new `derive-node-states.test.ts`).
- `npm run build` — succeeded. `/dashboard` is `○ (Static)`, 114 kB page JS / 229 kB First
  Load JS (recharts bundled client-side only on that route, as intended); `/runs/[id]` and
  `/datasets/[id]` remain `ƒ (Dynamic)`; `/datasets` is `○ (Static)`.

## Concerns

- None blocking. The recharts/shadcn tooltip-type cast is a narrow, well-scoped workaround
  confined to the new chart file; `components/ui/chart.tsx` itself was not modified.
- `derive-node-states.ts` omits unmatched nodes from the returned map rather than setting
  them to an explicit `pending` entry — this relies on `OrchestrationCanvas`'s existing
  default-state fallback behavior, which was confirmed (not modified) to already handle
  missing map entries correctly.
