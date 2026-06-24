# Task 2 Report — Workflow graph builder + events + runner refactor

Plan: `docs/superpowers/plans/2026-06-23-ui-overhaul-orchestration-view-plan.md` (Task 2 section,
plus "Global Constraints" and "Shared Interfaces").

## What was built

### `lib/workflows/graph.ts`
`buildWorkflowGraph(workflow: WorkflowKind): WorkflowGraph` — pure, deterministic, no side
effects. Exports `GraphNodeKind`, `GraphNode`, `GraphEdge`, `WorkflowGraph` exactly per the
shared interface (id/kind/label/role?/model?/column/row on nodes; from/to on edges).

Every workflow shares an `input` (col 0) → `router` (col 1) prefix and a terminal `result`
node. Per-workflow node/edge shape (columns increase left→right, rows used only for the
parallel panelists):

- **single_cheap**: `input → router → cheap_reviewer(agent, col 2) → result(col 3)`
- **single_strong**: `input → router → strong_reviewer(agent, col 2) → result(col 3)`
- **panel_judge**: `input → router → {panelist-1, panelist-2, panelist-3}(agent, col 2,
  rows 0/1/2) → judge(judge, col 3) → result(col 4)`. Router fans out to all three
  panelists; all three fan into judge.
- **cheap_first**: `input → router → cheap_reviewer(col 2) → verifier(col 3) →
  strong_reviewer(col 4, label "Strong reviewer (escalation)") → result(col 5)`. The
  strong-reviewer node is always present in the graph (per spec — escalation is
  conditional only in whether the runner actually calls it).
- **planner_worker_verifier**: `input → router → planner(col 2) → worker(col 3) →
  verifier(col 4) → finalizer(finalizer kind, col 5) → result(col 6)`.

Node ids are stable strings (`"cheap_reviewer"`, `"panelist-1"`, `"judge"`, etc.) — chosen to
double as the natural `nodeId` for step events without an extra lookup table.

### `lib/workflows/events.ts`
`WorkflowEvent` discriminated union (`run-init`, `step-start`, `step-finish`, `escalation`,
`run-final`, `run-error`) and `WorkflowEventHandler = (event: WorkflowEvent) => void`,
transcribed verbatim from the plan's Shared Interfaces section. `run-final`/`run-error` are
defined for the type (needed by the future API route in Task 3) but the runner never emits
them — confirmed by a dedicated test.

### `lib/workflows/runner.ts` refactor
`runWorkflow` now destructures an optional `onEvent?: WorkflowEventHandler` from its args
object. Threading:

- `emitRunInit(workflow, onEvent)` runs immediately after `validateRunInput` and before the
  first model call. It builds the graph via `buildWorkflowGraph`, derives `plannedSteps` from
  every node that has a `role` (so router/input/judge's `role` exclusion doesn't apply —
  judge and finalizer do have roles and are included), and emits `run-init`. Skipped entirely
  (no graph build) when `onEvent` is undefined, preserving zero overhead for existing callers.
- `executeCall` gained a `nodeId: string` parameter (third positional arg, before the
  `ModelRequest`) — the natural seam, since every workflow branch already calls it once per
  model invocation. It now:
  1. Generates a stable `stepId` via a per-run `state.stepCounter` (`step_1`, `step_2`, ...).
  2. Emits `step-start` (stepId, nodeId, role, model) before calling `provider.complete`.
  3. On success, emits `step-finish` with `usage`, `costUsd` (= `trace.estimatedCostUsd`),
     `latencyMs`, and `responsePreview` (`trace.response.slice(0, 200)`), then returns the
     trace as before.
  4. On provider failure, it still pushes the error trace and rethrows **without** emitting
     `step-finish` — the in-flight step is left started-but-unfinished, which is exactly what
     the "still emits step-start ... with no run-final" test asserts and matches a UI that
     would show the node as failed/incomplete rather than a phantom completion.
- Every call site was updated to pass the matching graph node id: `"cheap_reviewer"`,
  `"strong_reviewer"`, `` `panelist-${index}` `` (1/2/3), `"judge"`, `"verifier"`, `"planner"`,
  `"worker"`, `"finalizer"`. These are literal string matches to the ids `buildWorkflowGraph`
  produces — verified by the `nodeId exists in run-init graph` assertion across all 5
  workflows plus an explicit panel_judge ordering test.
- `escalation` is emitted once, at the end of the `cheap_first` branch, after
  `escalated`/`escalationReason` are finalized for all three branches (cost-limit-blocked,
  escalated, and confidence-met) — so `escalated` and `reason` always reflect the real
  outcome, matching `result.escalated`/`result.escalationReason` byte-for-byte (asserted in
  tests for both the escalated and non-escalated cases).
- `run-final` is never emitted (left to the future API route per the plan).
- Behavior with no `onEvent`: unchanged. `RunResult` shape, the failed-run path
  (`buildFailedRun`), `assertWithinProjectedCostLimit`, and all scoring/evaluation logic are
  untouched — only `executeCall`'s signature gained a `nodeId` parameter and a few `onEvent?.()`
  calls were added, all guarded by optional chaining.

`createRun` and `rerunDatasetTask` in `lib/store/file-store.ts` were not modified; both call
`runWorkflow({ input, provider })` with no `onEvent`, which remains valid since the field is
optional.

## Tests

`tests/graph.test.ts` (7 tests) — `buildWorkflowGraph`:
- node ids/kinds/edges for `single_cheap`, `single_strong`
- node ids/kinds/edges/columns/rows for `panel_judge` (3 panelists + judge + result)
- node ids/edges/escalation label for `cheap_first`
- node ids/kinds/edges for `planner_worker_verifier`
- determinism across repeated calls (`toEqual` on two invocations)
- unique node ids within every workflow

`tests/runner-events.test.ts` (12 tests) — `runWorkflow` events, using `createMockProvider()`:
- parametrized over all 5 workflows: `run-init` is event 0, every `step-start` precedes its
  `step-finish` (same `stepId`), every step's `nodeId` exists in the `run-init` graph, planned
  step `nodeId`s also exist in the graph, `stepId`s are unique, summed `step-finish`
  `costUsd`/`latencyMs` equal `result.costUsd`/`result.latencyMs` exactly, and
  `responsePreview.length <= 200`
- `cheap_first` escalation event matches `result.escalationReason` when escalated (confidence
  0.35) and when not escalated (confidence 0.9)
- no `escalation` event for non-`cheap_first` workflows
- no `run-final` ever emitted
- `panel_judge` step `nodeId` order is exactly `["panelist-1", "panelist-2", "panelist-3",
  "judge"]`
- running with vs. without `onEvent` yields equivalent `RunResult` (status, workflow, costUsd,
  latencyMs, findings modulo generated ids, evaluation, calls modulo generated ids)
- provider failure still emits `run-init` and the first `step-start`, never a `step-finish` or
  `run-final`, and the returned run has `status: "failed"`

Existing suites untouched: `tests/workflows.test.ts` (9), `tests/metrics.test.ts` (2),
`tests/api-contracts.test.ts` (5).

**Total: 35/35 passing** (16 pre-existing + 7 graph + 12 runner-events).

## Verification output tails

```
npm run lint
✔ No ESLint warnings or errors

npm run typecheck
> tsc --noEmit
(no output — success)

npx vitest run
 ✓ tests/metrics.test.ts (2 tests)
 ✓ tests/graph.test.ts (7 tests)
 ✓ tests/workflows.test.ts (9 tests)
 ✓ tests/runner-events.test.ts (12 tests)
 ✓ tests/api-contracts.test.ts (5 tests)
 Test Files  5 passed (5)
      Tests  35 passed (35)
```

`git status` after both commits: clean working tree.

## Commits

1. `14ba581` — `feat(workflows): add workflow graph builder and event types`
   (`lib/workflows/graph.ts`, `lib/workflows/events.ts`, `tests/graph.test.ts`)
2. `7a20a7a` — `feat(workflows): emit run-init/step/escalation events from runWorkflow`
   (`lib/workflows/runner.ts`, `tests/runner-events.test.ts`)

## Concerns

- None blocking. One judgment call worth flagging for the Task 3/4 implementers: on a
  mid-step provider failure, `executeCall` emits `step-start` but never `step-finish` for that
  step (the error trace is pushed to `calls` but no event fires). This seems correct for a
  live UI (show the node as failed, not silently completed) but Task 4's `OrchestrationCanvas`
  should treat "no step-finish + run never reaches run-final" as a failure state rather than
  stalling indefinitely waiting for that node's finish event.
- `plannedSteps` in `run-init` uses a synthetic `stepId` (`planned_<nodeId>`) distinct from the
  real per-call `stepId` (`step_N`) emitted by `step-start`/`step-finish` — they're never meant
  to be joined by `stepId`, only by `nodeId`. This matches the spec's wording ("nodeId on each
  step MUST equal the corresponding graph node id") but is worth calling out since the two
  `stepId` spaces look similar at a glance.
