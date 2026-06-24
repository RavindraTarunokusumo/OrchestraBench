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

## Final-review fixes

Commits:
- `2dd8f91` fix: make static orchestration replay node mapping order-independent
- `851fd2c` docs+test: clarify run-error scope and exercise POST handler directly

### Finding 1 — order-independent static replay mapping

Root cause: `panel_judge` launches its three panelist calls via `Promise.all`, so
`run.calls` is in completion order, not launch order. The old `deriveNodeStatesFromCalls`
consumed calls per-role left-to-right (a FIFO), so with a real provider where panelist-2
finishes before panelist-1, the response would land under the wrong graph node
(`panelist-1`) in the persisted/static Run Detail replay. The live SSE path was already
correct because `executeCall` binds `nodeId` via closure when emitting `step-start`/
`step-finish`.

nodeId threading approach:
- Added optional `nodeId?: string` to `ModelCallTrace` (`lib/domain/types.ts`).
- `lib/workflows/runner.ts`'s `executeCall` already receives `nodeId` as a parameter.
  On the success path, `trace.nodeId = nodeId` is set right after `toCallTrace()` builds
  the trace (left `toCallTrace` itself untouched in `lib/providers/types.ts` since the
  caller already has the value and a constructor-arg change would touch more call
  sites for no benefit). On the catch/error path, `nodeId` is included directly in the
  hand-built error trace literal.
- `components/orchestration/derive-node-states.ts` now builds a `Map<nodeId, call>`
  from any call carrying a `nodeId` (authoritative, direct match) and only consults the
  legacy role-order FIFO queue for calls without one, so older persisted runs (saved
  before this change) still render via the previous fallback behavior.

Tests added/kept green:
- `tests/derive-node-states.test.ts`: added
  `"maps panelist calls by nodeId even when the array order is completion order, not launch order"`
  — constructs calls in array order `panelist-2, panelist-1, panelist-3, judge` but
  with correct `nodeId`s, and asserts each lands on its correct graph node despite the
  out-of-order array. All 5 pre-existing cases (including the role-order fallback ones,
  which omit `nodeId`) still pass unmodified.
- `tests/runner-events.test.ts`: no assertions touch trace shape directly (only
  step-event nodeId/stepId), so all 12 cases passed unmodified — confirmed by running
  the file after the runner change.

### Finding 2 — run-error scope comment

Added a 3-line comment in `app/api/runs/stream/route.ts` directly above the
`run-error` `send(...)` call in the `catch` block, explaining that `runWorkflow`
already catches in-workflow failures internally and resolves a `status:"failed"`
`RunResult` (which surfaces as `run-final`), so this `catch` only covers errors
raised outside the workflow call itself (e.g. `createConfiguredProvider` throwing,
or `saveRun` persistence failing). No behavioral change — comment only.

### Finding 3 — exercise the real POST handler

Added a new file, `tests/stream-route-handler.test.ts` (left `tests/stream-route.test.ts`
untouched, per the constraint), which imports `POST` from
`@/app/api/runs/stream/route` and invokes it directly:
- `"streams run-init followed by a terminal run-final for a valid run request"` —
  builds a real `Request` with a valid JSON body, awaits `POST(req)`, asserts
  `response.status === 200` and `Content-Type: text/event-stream`, reads the full
  response body text, splits it into SSE `data:` lines, and asserts the first parsed
  event is `run-init` and the last is a `run-final` with `status: "completed"`.
- `"returns 400 without opening a stream when the body is invalid"` — posts a body
  missing `code`, asserts `response.status === 200` is *not* hit (`400` instead) and
  `Content-Type` is not `text/event-stream`, then parses the JSON error body and
  asserts an `error` message is present.

No `OPENROUTER_API_KEY` is set in the test environment, so `createConfiguredProvider()`
resolves to the mock provider — no network calls are made. This was feasible to invoke
directly; no fallback was needed. One pre-existing flake was observed when running
`tests/stream-route.test.ts` and the new file together via a hand-picked `npx vitest run
<file> <file>` invocation (a `.data/orchestrabench.json` rename `EPERM` from two test
files racing on the same on-disk store under Windows); it did not reproduce under the
project's actual `npm test` gate or when run in isolation, so it is noted as a pre-existing
file-store contention risk under Windows, not a regression from this change.

### Verification tails

```
npm run lint
✔ No ESLint warnings or errors

npx tsc --noEmit
(clean, no output)

npm test
 Test Files  9 passed (9)
      Tests  58 passed (58)

npm run build
✓ Compiled successfully in 6.6s
✓ Generating static pages (11/11)
```
