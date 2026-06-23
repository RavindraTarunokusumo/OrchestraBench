# Implementation Plan — UI Overhaul + Live Orchestration View

Spec: `docs/superpowers/specs/2026-06-23-ui-overhaul-orchestration-view-design.md`
Executed via subagent-driven-development with **Sonnet** implementer + reviewer subagents.

## Global Constraints (binding — copy verbatim into reviewer prompts)

- Stack: Next.js 15 App Router, React 19, TypeScript, Zod. Persistence is the existing
  JSON file-store (`lib/store/file-store.ts`). No Inngest, no Prisma/DB migration.
- Animation library is **GSAP** (not Framer Motion). Charts are **recharts** (via shadcn chart).
- Light **and** dark themes via `next-themes`.
- `runWorkflow` MUST keep returning the same `RunResult`. The `onEvent` callback is
  **optional**; existing callers (`createRun`, `rerunDatasetTask`) pass none and behave
  exactly as before.
- Each TODO sub-item / task lands as its own commit. Specific staging only (no `git add -A`).
- `npm run lint` and `npm run typecheck` must pass before each commit. `npm test` (vitest)
  must stay green; new pure logic gets unit tests.
- OneDrive worktree: `npm install` can time out. Install new deps in small batches; if a
  shadcn CLI step stalls, write the component file(s) manually. Verify `package-lock.json`
  updates.
- Keep comments sparse, naming clear, abstractions minimal, no compatibility shims.

## Shared Interfaces (decided once, used across tasks)

### Workflow graph (`lib/workflows/graph.ts`)
```ts
export type GraphNodeKind = "input" | "router" | "agent" | "judge" | "finalizer" | "result";
export type GraphNode = {
  id: string;            // stable, unique within a workflow, e.g. "panelist-1"
  kind: GraphNodeKind;
  label: string;         // human label, e.g. "Panel reviewer 1"
  role?: ModelRole;      // present for kind "agent" | "judge" | "finalizer"
  model?: string;        // model id when known at graph-build time
  column: number;        // 0-based layout column (left→right)
  row: number;           // 0-based row within a column (for parallel siblings)
};
export type GraphEdge = { from: string; to: string };
export type WorkflowGraph = { nodes: GraphNode[]; edges: GraphEdge[] };
export function buildWorkflowGraph(workflow: WorkflowKind): WorkflowGraph;
```
Each workflow's node set mirrors the role sequence in `lib/workflows/runner.ts`:
- single_cheap: input → router → cheap_reviewer(agent) → result
- single_strong: input → router → strong_reviewer(agent) → result
- panel_judge: input → router → [panelist-1, panelist-2, panelist-3] → judge → result
- cheap_first: input → router → cheap_reviewer → verifier → strong_reviewer(escalation) → result
  (the strong node is marked as conditional via label; always present in the graph)
- planner_worker_verifier: input → router → planner → worker → verifier → finalizer → result

### Stream events (`lib/workflows/events.ts`)
```ts
export type WorkflowEvent =
  | { type: "run-init"; workflow: WorkflowKind; graph: WorkflowGraph; plannedSteps: { stepId: string; nodeId: string; role: ModelRole; model: string }[] }
  | { type: "step-start"; stepId: string; nodeId: string; role: ModelRole; model: string }
  | { type: "step-finish"; stepId: string; nodeId: string; role: ModelRole; model: string; usage: ModelUsage; costUsd: number; latencyMs: number; responsePreview: string }
  | { type: "escalation"; escalated: boolean; reason: string }
  | { type: "run-final"; runId: string; status: RunStatus; costUsd: number; latencyMs: number; findingsCount: number; qualityScore: number; valueScore: number }
  | { type: "run-error"; message: string };
export type WorkflowEventHandler = (event: WorkflowEvent) => void;
```
`nodeId` on each step MUST equal the corresponding graph node `id` so the UI maps steps→nodes.
`responsePreview` is the first ~200 chars of the model response.

### Runner refactor
`runWorkflow` gains an optional `onEvent?: WorkflowEventHandler` in its args. It emits
`run-init` after planning, `step-start`/`step-finish` around each `executeCall`, `escalation`
for cheap_first, and (NOT run-final — that is emitted by the API route after persistence,
which owns the run id). On thrown error the runner still returns a failed `RunResult` as today;
the route emits `run-error` if it catches, else `run-final`.

### Stream wire format
SSE: each event is a line `data: <json>\n\n`. Route runtime = `nodejs`.

---

## Task 1 — Tailwind v4 + shadcn/ui foundation

**Files:** `package.json`, `postcss.config.mjs`, `app/globals.css`, `components.json`,
`lib/utils.ts`, `components/ui/*`, `components/theme-provider.tsx`,
`components/theme-toggle.tsx`, `app/layout.tsx`.

- Add Tailwind v4 + PostCSS, `tailwind-merge`, `clsx`, `class-variance-authority`,
  `lucide-react`, `next-themes`, `gsap`, `recharts`. Init shadcn (`components.json`,
  `lib/utils.ts` `cn`). New-York style, CSS variables, slate base.
- Add shadcn components: button, card, input, textarea, label, select, table, badge,
  tabs, separator, skeleton, tooltip, progress, sonner, scroll-area, chart.
- Replace `app/globals.css` with Tailwind v4 entry + shadcn token layer (light + dark).
  Remove the bespoke `.shell/.topbar/...` classes ONLY after the pages that used them are
  migrated — for Task 1, keep the old classes working OR migrate `layout.tsx` nav now and
  leave page-level classes until their task. Decision: migrate `layout.tsx` now (nav becomes
  shadcn), and keep the legacy utility classes in globals.css temporarily so existing pages
  still render; later tasks remove their legacy usage. Document any leftover legacy classes.
- `layout.tsx`: wrap in `ThemeProvider`, render a polished top nav (brand, links: New Run,
  Dashboard, Datasets, Export; theme toggle), add `<Toaster />`.
- Acceptance: `npm run dev` renders all existing pages without visual breakage; theme toggle
  switches light/dark; lint + typecheck pass.

## Task 2 — Workflow graph builder + events + runner refactor

**Files:** `lib/workflows/graph.ts`, `lib/workflows/events.ts`, `lib/workflows/runner.ts`,
tests under `lib/workflows/__tests__/` (or alongside, matching existing test location).

- Implement `buildWorkflowGraph` per the shared interface. Pure, no side effects.
- Implement `WorkflowEvent` union + handler type.
- Refactor `runWorkflow` to accept optional `onEvent` and emit `run-init`, `step-start`,
  `step-finish`, `escalation` at the right points. `executeCall` is the natural seam for
  step events — thread `stepId`/`nodeId` through. Do NOT emit `run-final`.
- Tests: graph correctness for all 5 workflows; event ordering + nodeId↔graph mapping +
  emitted totals equal returned `RunResult` totals (mock provider).
- Acceptance: existing tests green; new tests pass; `createRun`/`rerunDatasetTask` unchanged.

## Task 3 — Streaming API route

**Files:** `app/api/runs/stream/route.ts`.

- `POST` (runtime `nodejs`): parse + validate body with the same run schema shape used in
  `app/actions.ts` (extract/share the zod schema if convenient). Create a `ReadableStream`,
  run `runWorkflow` with `onEvent` serializing each event as an SSE `data:` line. After the
  workflow returns, persist via the store (add a store fn that persists a pre-computed
  `RunResult`, e.g. `saveRun(result)`, to avoid double-running the workflow) and emit
  `run-final` with the persisted run id. Catch errors → emit `run-error`, close stream.
- Add `saveRun(result: RunResult)` to `file-store.ts` (persists without re-running). Keep
  `createRun` working (it can delegate: run workflow then `saveRun`).
- Acceptance: hitting the endpoint streams events ending in `run-final`; the run appears in
  the store and on `/runs/[id]`. lint + typecheck pass.

## Task 4 — OrchestrationCanvas (GSAP) + useRunStream

**Files:** `components/orchestration/canvas.tsx`, `components/orchestration/use-run-stream.ts`,
`components/orchestration/node.tsx` (and small helpers).

- `useRunStream`: starts a POST to `/api/runs/stream`, parses SSE lines into typed
  `WorkflowEvent`s, exposes `{ status, graph, nodeStates, totals, escalation, finalRunId, error, start() }`.
  Enforce a client-side **minimum active duration** (~500ms) per node so fast mock runs read well.
- `OrchestrationCanvas`: given a `graph` + `nodeStates`, lays out nodes by column/row,
  draws SVG edges, and uses **GSAP** to: pulse/glow active nodes, animate edge stroke-dashoffset
  flow into the next node, settle done nodes. GSAP timelines created in a `useGSAP`/ref effect
  with proper cleanup on unmount (no leaked tweens). Live HUD: totals (cost/latency/tokens),
  step k/N progress bar, escalation banner.
- Modes: `live` (driven by useRunStream node states) and `static` (given a graph and optional
  completed trace → all nodes done, no animation loop, used by Run Detail/future guide).
- Respect `prefers-reduced-motion` (GSAP matchMedia): skip continuous tweens, just set states.
- Acceptance: component renders for each workflow graph; no console errors; cleanup verified
  (unmount kills tweens). lint + typecheck pass.

## Task 5 — New Run page live integration

**Files:** `app/runs/new/page.tsx` (+ a client child, e.g. `app/runs/new/new-run-client.tsx`).

- Convert to client-driven flow: the form (shadcn inputs) submits via `useRunStream.start()`
  instead of the server action redirect. While running, render `OrchestrationCanvas` (live)
  in place. On `run-final`, show an inline summary (quality/value/cost/latency + findings count)
  and a "View full report" button → `/runs/[id]`. On `run-error`, show the error and allow retry.
- Keep server action `createRunAction` for non-JS fallback is OUT OF SCOPE; the page may be
  fully client. Validation errors surface inline (reuse zod client-side or trust server 400).
- Acceptance: submitting runs the workflow live with animation, then links to the detail page;
  the run is persisted. lint + typecheck pass.

## Task 6 — Home landing/overview page

**Files:** `app/page.tsx`, maybe `components/home/*`.

- Replace the redirect with a real landing page: hero (what OrchestraBench does), the 5
  workflows as shadcn cards (name + one-line description, derived from the spec), primary CTA
  → New Run, secondary → Dashboard/Datasets, and a recent-runs strip (read via `listRuns`,
  show empty state when none).
- Acceptance: `/` renders the landing page (no redirect); links work; empty state shows when
  no runs. lint + typecheck pass.

## Task 7 — Dashboard charts + empty/loading states + Run Detail replay

**Files:** `app/dashboard/page.tsx`, `app/dashboard/loading.tsx`, `app/datasets/loading.tsx`,
`app/runs/[id]/page.tsx`, `app/runs/[id]/loading.tsx`, chart component(s) under `components/`.

- Dashboard: migrate to shadcn Card/Table; add a value-score leaderboard bar chart and a
  quality-vs-cost chart using recharts (shadcn chart wrapper). Per-workflow summary cards.
  Empty state when no runs.
- Add `loading.tsx` skeletons for dashboard, datasets, run detail.
- Run Detail: migrate to shadcn; add a static `OrchestrationCanvas` (replay from saved
  `calls` trace) above/near the model-call trace section. Keep findings/evaluation/feedback.
- Datasets + dataset detail: migrate to shadcn components and add empty states (lighter touch).
- Acceptance: dashboard shows charts with data and a clean empty state; loading skeletons
  render; run detail shows the static orchestration replay. lint + typecheck + tests pass.

## Sequencing & dependencies
T1 → (T2, then T3) → T4 → T5 → (T6, T7 can follow T4/T5). Execute in numeric order for safety.
Each task = its own commit(s); tick the matching TODO sub-item after its review is clean.
