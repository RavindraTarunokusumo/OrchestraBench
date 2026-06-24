# Task 4 — OrchestrationCanvas (GSAP) + useRunStream — Report

## What was built

1. **`components/orchestration/use-run-stream.ts`** — `useRunStream()` hook + pure helpers.
2. **`components/orchestration/canvas.tsx`** — `OrchestrationCanvas` (live + static modes).
3. **`components/orchestration/node.tsx`** — `OrchestrationNode` card subcomponent.
4. **`tests/use-run-stream.test.ts`** — 13 unit tests on the pure functions only.

No pages were touched — these are standalone components per the Task 4 scope; wiring into
`app/runs/new` is Task 5.

## `useRunStream` API

```ts
const {
  status,        // "idle" | "running" | "complete" | "failed" | "error"
  graph,          // WorkflowGraph | null, set from run-init
  nodeStates,     // Record<nodeId, NodeState>
  totals,         // { costUsd, latencyMs, inputTokens, outputTokens, stepsDone, stepsTotal }
  escalation,     // { escalated, reason } | null
  finalRunId,     // string | null
  error,          // string | null
  start           // (input: RunInput) => void
} = useRunStream();
```

`NodeState = { status: "pending"|"active"|"done"|"failed"; model?; usage?; costUsd?; latencyMs?; responsePreview? }`.

### Pure functions (exported, unit-tested, no React/DOM)

- `reduceStreamEvent(prev: RunStreamState, event: WorkflowEvent): RunStreamState` — the entire
  event→state reduction. Maps every step event onto `nodeStates` by **`event.nodeId`**, never
  `event.stepId` (verified by a dedicated test using a live `stepId` that has no relation to
  the `plannedSteps[].stepId` space). `run-init` marks `input`/`router` nodes `done` immediately
  (they have no step events) and everything else `pending`; `run-final` flips the graph's
  `result`-kind node to `done` (status `"completed"`) or `failed` (status `"failed"`) and
  always sets `finalRunId` — even on a failed run, since `run-final` only ever fires after
  persistence. `run-error` only sets `status: "error"` + `error` message, never touches
  `finalRunId` (nothing was persisted).
- `parseSseChunk(buffer: string): { events: WorkflowEvent[]; rest: string }` — splits on
  `\n\n`, strips a leading `data: `, `JSON.parse`s each complete segment, and returns any
  trailing partial segment as `rest` untouched (not parsed) for the caller to prepend to the
  next chunk.
- `markStalledActiveNodesFailed(state)` — flips any node still `"active"` to `"failed"` and the
  overall `status` to `"failed"` if it was `"running"`. Used internally when the stream's
  reader loop exits (`done` from `getReader()`) without ever having seen a `run-final` or
  `run-error` event — the mid-run-crash case called out in the brief (step-start with no
  matching step-finish, stream just ends).

### `start(input)` behavior

- POSTs JSON to `/api/runs/stream`.
- If `response.status === 400` (or any non-OK status), reads the JSON error body (`{ error }`)
  and sets `status: "error"` **without** opening a reader — matches the route's documented
  "no stream on invalid input" behavior.
- Otherwise reads `response.body.getReader()`, decodes with `TextDecoder({ stream: true })`,
  buffers, and feeds each chunk through `parseSseChunk`, applying events in order.
- Tracks `sawTerminalEvent` (`run-final` or `run-error`) across the read loop; if the loop ends
  without one, calls `markStalledActiveNodesFailed` — this is the mid-run-failure guard so the
  UI never hangs in "running" forever.

### Minimum active duration (~500ms)

Implemented entirely in the hook (not in the pure reducer, which stays framework-free):
- `step-start` records `Date.now()` per `nodeId` in a `useRef<Map>` and immediately reduces.
- `step-finish` checks elapsed time since that node's recorded start; if under 500ms, the
  event is held in a `setTimeout` for the remainder before reducing, instead of being applied
  immediately. Timers are stored in a `useRef<Map<nodeId, TimeoutHandle>>`.
- A mount-tracking ref (`mountedRef`) guards every deferred `setState` call, and the cleanup
  effect clears all pending timers on unmount — no setState-after-unmount, no leaked timers.
- `start()` also clears any leftover timers/active-since entries before beginning a new run
  (covers the retry-after-error case).

## `OrchestrationCanvas` API

```ts
<OrchestrationCanvas
  graph={graph}                 // WorkflowGraph | null
  nodeStates={nodeStates}
  totals={totals}               // optional, HUD only used when mode="live"
  escalation={escalation}       // optional
  status={status}                // optional, drives the HUD status label
  mode="live" | "static"
  finalRunId={finalRunId}        // optional, shown as a badge in the live HUD
/>
```

- Renders `null`-graph as a dashed placeholder box (no crash on `graph: null`).
- Lays out nodes absolutely by `node.column`/`node.row` on a fixed grid
  (`COLUMN_WIDTH=196, ROW_HEIGHT=96, NODE_WIDTH=160`), and draws one SVG `<path>` per
  `GraphEdge` as a cubic Bézier between node centers, sized to a `<svg>` that exactly spans the
  computed canvas bounds — verified to render correctly given **any** all-pending or all-done
  `nodeStates` map (Task 7's static replay use case), since node lookups fall back to
  `{ status: "pending" }` via `defaultNodeState()` when a graph node has no entry yet.
- Node visual states map to Tailwind/shadcn tokens in `node.tsx`: `pending` → muted/dim border,
  `active` → primary border + shadow + pulsing ring, `done` → accent border, `failed` →
  destructive border + tinted background + `CircleX` icon override.
- Live HUD (`mode === "live"` only): cost/latency/token totals, a `step k/N` label, a shadcn
  `Progress` bar (`stepsDone/stepsTotal`), an amber escalation banner when
  `escalation.escalated`, and a `finalRunId` badge once set.

### GSAP structure + cleanup

All tweens are created inside `gsap.context(() => {...}, rootRef)` inside a `useLayoutEffect`
keyed on `[graph, nodeStates, mode]`; the effect returns `() => ctx.revert()`. Every render
that changes node/edge state reverts the previous context's tweens before creating new ones —
no accumulation, no leaks, verified by reading the cleanup path (no DOM test harness exists in
this repo; see "Testing notes" below).

Inside the context: `gsap.matchMedia()` registers two branches —
- `"(prefers-reduced-motion: reduce)"`: `gsap.set` (not tween) active-node opacity and
  edge `strokeDashoffset` straight to their end states. No `repeat: -1` loop is ever created.
- `"(prefers-reduced-motion: no-preference)"`: only when `mode === "live"` does it create the
  continuous pulse (`boxShadow` from a computed `--primary` color out to transparent,
  `repeat: -1`) on every `.orchestration-node-ring` element (rendered only for `active` nodes
  in `node.tsx`), and a one-shot `strokeDashoffset` flow-in tween (`getTotalLength()` →
  animate to 0) on every edge currently flagged `data-edge-flowing="true"`. In `static` mode
  this branch just snaps `strokeDashoffset` to 0 (no loop) since static replay should not
  animate continuously per the spec.
- The pulse color reads `getComputedStyle(rootRef.current).getPropertyValue("--primary")` at
  tween-creation time rather than hardcoding a hex value, so the glow matches the active theme
  (light/dark) without a CSS-var-interpolation tween (GSAP's CSS plugin doesn't reliably
  interpolate colors expressed as `var(...)` across keyframes, so the *value* is resolved in
  JS once and used as a literal color string in both the `fromTo` from/to objects).
- Returned cleanup from each `mm.add` callback kills only that branch's tweens
  (`pulses.forEach(t => t.kill())`); `gsap.context`'s own revert additionally tears down the
  `matchMedia` instance itself.

## Reduced-motion handling

Exactly one mechanism: `gsap.matchMedia()` inside the context (see above). There is no
separate React-level `prefers-reduced-motion` listener/hook in this codebase — GSAP's
`matchMedia` re-evaluates automatically when the media query changes and reruns the matching
branch, which is the standard documented integration pattern and avoids a second source of
truth for the same media query.

## Failure-mode rendering

- **`run-error`** (nothing persisted): `useRunStream.status` becomes `"error"`, `finalRunId`
  stays `null`. A consumer (Task 5) should show the message and a retry button, with no link
  to a run page.
- **`run-final` with `status: "failed"`** (a run *was* persisted): `useRunStream.status`
  becomes `"failed"`, `finalRunId` is set, and the graph's `result` node renders with
  `status: "failed"` (destructive styling). A consumer can still link to `/runs/[finalRunId]`.
- **Mid-run stall** (step-start with no step-finish, stream just ends): handled by
  `markStalledActiveNodesFailed` — the stuck node flips from `active` to `failed`, and
  `status` becomes `"failed"` (only if it was still `"running"`; idempotent otherwise). This
  guarantees the canvas never shows a permanently spinning/pulsing node after the stream
  closes.

## Tests (`tests/use-run-stream.test.ts`, 13 tests, all passing)

`parseSseChunk`: splits multiple complete events and strips `data: ` (1), returns a partial
trailing event as `rest` without parsing it (1), is a no-op on an empty buffer (1).

`reduceStreamEvent`: `run-init` initializes input/router done + rest pending + graph + stepsTotal (1),
`step-start` sets the matching node active **by nodeId** (1), `step-finish` sets done + accumulates
totals by nodeId (1), an explicit stepId/nodeId-space-mismatch case using an unrelated live
`stepId` against `plannedSteps[].stepId="planned_1"` (1), `escalation` sets the escalation field
(1), `run-final` completed → status complete + finalRunId + result node done (1), `run-final`
failed → status failed + finalRunId still set + result node failed (1), `run-error` → status
error + message + finalRunId stays null (1).

`markStalledActiveNodesFailed`: flips an active node to failed and overall status to failed (1),
no-op (returns the same reference) when nothing is active (1).

GSAP/DOM are intentionally not tested, per the brief — no jsdom/RTL is installed in this repo
(`vitest.config.ts` uses `environment: "node"`), so canvas/node rendering was verified via
`tsc --noEmit` + `next build`'s type-and-compile pass plus manual code review, not a mounted
render.

## Verification tails

- `npm run lint` → "No ESLint warnings or errors" (fixed one `react-hooks/exhaustive-deps`
  warning on the timer-cleanup effect by copying `pendingTimersRef.current` into a local
  variable before the cleanup closure, per the standard React fix for that rule).
- `npm run typecheck` → clean (`tsc --noEmit`, no output).
- `npm test` → 7 test files, **50 passed** (37 pre-existing + 13 new in
  `tests/use-run-stream.test.ts`).
- `npm run build` → succeeded; route table unchanged (these components aren't imported by any
  page yet, so they don't appear in the bundle list, but `next build`'s own typecheck pass
  covers them).

## Concerns / notes for Task 5

- **Wiring contract**: `useRunStream()` returns `{ ...state, start }`. Task 5's New Run page
  should call `start(input)` on form submit and render `<OrchestrationCanvas graph={graph}
  nodeStates={nodeStates} totals={totals} escalation={escalation} status={status}
  finalRunId={finalRunId} mode="live" />` while `status === "running"`. On `status ===
  "complete"` or `"failed"`, `finalRunId` is available for a "View full report" link.
  On `status === "error"`, show `error` and let the user retry (calling `start` again is safe —
  it resets all hook state including timers).
- **`RunInput` shape**: `start` takes the same `RunInput` type the route validates
  (`title, language, prompt, code, workflow, costLimitUsd?, benchmarkTaskId?, knownBugs?`) —
  Task 5's form should build this object directly; no separate client-side schema was added
  since the brief said trusting the server's 400 response is acceptable.
- **Static mode for Task 7**: `mode="static"` with a fully `"done"` (or fully `"pending"`)
  `nodeStates` map renders the same grid/edges with no animation loop — verified by code
  inspection (the `mode === "live"` check gates the only `repeat: -1` tween creation). Task 7
  will need to derive a `nodeStates` map from a saved `RunResult.calls` trace plus
  `buildWorkflowGraph(workflow)`; that derivation does not exist yet and is out of this task's
  scope.
- **No jsdom/RTL in this repo** — if a future task wants to assert on rendered DOM/GSAP
  behavior, that's a new test-infra addition, not something this task silently introduced.
- The edge "flow" tween re-triggers from full dasharray on every `nodeStates` change for any
  edge already flagged `flowing` (because the GSAP effect's dependency array includes
  `nodeStates`, which changes on every event) — this is a minor, intentional simplification:
  visually it just makes the edge "pulse" again on each step transition along that path. Not a
  bug, but worth knowing if a reviewer is comparing against a stricter "animate once" reading
  of the spec.

## Commits

- `7c26084` — feat: add useRunStream hook for live SSE orchestration state
- `f0e3f7d` — feat: add OrchestrationCanvas + node card for live/static workflow view
