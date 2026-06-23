# UI Overhaul + Live Orchestration View — Design Spec

Date: 2026-06-23
Status: Accepted (design); pending implementation plan

## 1. Goal

Improve OrchestraBench's UI with a cohesive design system, populate sparse/empty
pages, and add a **live orchestration view** that visually animates how a code-review
query flows through a selected workflow as it executes.

Derived from `SPEC.md`: the app benchmarks 5 orchestration workflows (single cheap,
single strong, panel + judge, cheap-first escalation, planner → worker → verifier)
over code-review tasks, logging models, roles, tokens, cost, latency, findings,
evaluation, and feedback.

## 2. Current State

- Next.js 15 App Router, React 19, TypeScript, Zod. Persistence via a JSON file-store
  (`lib/store/file-store.ts`); Prisma is a dependency but unused at runtime.
- UI is hand-rolled CSS in `app/globals.css`. **No Tailwind, no shadcn/ui.**
- Pages: `/` (bare redirect → `/runs/new`), `/runs/new`, `/runs/[id]`, `/dashboard`,
  `/datasets`, `/datasets/[id]`.
- Runs execute **synchronously**: server action `createRunAction` → `createRun`
  → `runWorkflow` (whole workflow runs, then redirect to detail page). No live progress.
- `runWorkflow` returns a `RunResult` with a full `calls` trace (role, model, tokens,
  cost, latency, response per model call).
- Provider: OpenRouter when `OPENROUTER_API_KEY` is set, else a deterministic mock.

## 3. Requirements

### Functional
1. Adopt Tailwind v4 + shadcn/ui across all pages, with light and dark themes.
2. Live orchestration view: as a run executes, stream step-by-step progress and animate
   a node-graph of the workflow (User → Router → role agents → Judge/Finalizer → Result).
3. Populate pages: real landing/overview home, richer dashboard (charts), and
   empty/loading states throughout. (A dedicated workflow-guide page is **deferred**
   to a later session.)
4. Existing functionality (dataset rerun, feedback, export, run detail) must keep working.

### Non-functional
- No new backend infra (no Inngest, no DB migration). Reuse file-store + Zod.
- Animation must read well even when the mock/free model returns near-instantly.
- Existing Vitest suite stays green; new logic is unit-tested.

## 4. Architecture

### 4.1 Foundation — Tailwind v4 + shadcn/ui
- Add Tailwind v4, `components.json`, CSS-variable theming, `next-themes` for light/dark.
- Replace `globals.css` tokens with the shadcn token system; retain a thin set of
  custom utilities only where needed.
- shadcn components: button, card, input, textarea, select, table, badge, tabs,
  separator, skeleton, tooltip, progress, sonner (toasts), scroll-area, chart (recharts).
- `layout.tsx`: polished top nav (brand, links, theme toggle).
- **Risk / mitigation:** `npm install` can time out in OneDrive-backed worktrees
  (`docs/insights.md`). Install in small batches; if the shadcn CLI stalls, add the
  generated component files manually.

### 4.2 Workflow graph builder (single source of truth)
- New module (e.g. `lib/workflows/graph.ts`) exposing `buildWorkflowGraph(workflow)`
  → typed `{ nodes, edges }` where nodes carry `{ id, role, label, model?, kind }`
  (`kind`: `input | router | agent | judge | finalizer | result`) and edges define flow.
- Used by BOTH the live animation and the static guide diagrams. Pure + unit-tested.

### 4.3 Streaming orchestration engine
- Refactor `runWorkflow` to accept an optional `onEvent(event)` callback. It still
  returns the final `RunResult` so existing callers (`createRun`, `rerunDatasetTask`)
  are unaffected (they pass no callback).
- Event types (discriminated union, e.g. `lib/workflows/events.ts`):
  - `run-init`: `{ workflow, graph, plannedSteps }` — lets the UI render the full graph
    with all nodes pending up front.
  - `step-start`: `{ stepId, nodeId, role, model }`
  - `step-finish`: `{ stepId, nodeId, role, model, usage, costUsd, latencyMs, responsePreview }`
  - `escalation`: `{ escalated, reason }`
  - `run-final`: `{ runId, status, evaluation, costUsd, latencyMs, findingsCount }`
  - `run-error`: `{ message }`
- Step identity: assign stable `stepId`/`nodeId` so parallel panelists (panel_judge)
  animate concurrently and map cleanly onto graph nodes.
- New route handler `POST /api/runs/stream` (Node runtime): validate input (reuse the
  existing run Zod schema) → create a `ReadableStream` → run the workflow with `onEvent`
  serializing each event as an SSE line → on completion persist the run via the store and
  emit `run-final` (with the new run id) → close the stream. On thrown error emit
  `run-error` then close.

### 4.4 Orchestration view UI (centerpiece)
- Client component `OrchestrationCanvas`:
  - Renders nodes from the workflow graph; SVG edges between them.
  - Node states: `pending` (dim) → `active` (pulsing glow, animated edge flow via
    stroke-dashoffset) → `done` (filled; shows tokens / cost / latency).
  - Live HUD: running totals (cost, latency, tokens), step `k/N` progress bar,
    escalation banner when emitted.
  - **Minimum per-step display duration** (client-side, ~400–600ms) so fast backends
    still produce a legible animation.
  - Animation via **GSAP** (timeline-driven node glow + SVG edge-flow tweens),
    wired through React refs with cleanup on unmount.
  - Two modes: `live` (consumes the SSE stream) and `static` (renders a graph or a
    completed trace without animation/with replay).
- A `useRunStream` hook wraps `fetch` + stream parsing into typed events and derived
  state (node statuses, totals, final run id).

### 4.5 Page changes
- **`/runs/new`**: form submit no longer redirects; the page switches in-place to the
  live `OrchestrationCanvas` driven by `/api/runs/stream`. On `run-final` it shows an
  inline summary + "View full report" → `/runs/[id]`. Validation errors surface inline.
- **`/` Home**: real landing/overview — hero, the 5 workflows as cards (link to guide),
  primary CTA to New Run, recent-runs strip. Replaces the redirect.
- **`/dashboard`**: keep comparison table; add value-score leaderboard bars and a
  quality-vs-cost chart (shadcn/recharts), per-workflow cards, and an empty state.
- **Run Detail `/runs/[id]`**: render a static `OrchestrationCanvas` replay from the
  saved `calls` trace, alongside the existing findings/evaluation/trace sections.
- **Empty/loading**: `loading.tsx` skeletons + empty states for dashboard, datasets,
  run detail.

## 5. Data Flow (live run)

```
New Run form (client)
  → POST /api/runs/stream (validated input)
    → runWorkflow({ input, provider, onEvent })
        emits run-init → step-start/step-finish (× steps) → escalation? → persist → run-final
  ← SSE events streamed to client
  → useRunStream updates node states + HUD
  → OrchestrationCanvas animates
  → on run-final: inline summary + link to /runs/[id]
```

## 6. Edge Cases
- Provider/network failure mid-run → `run-error` event; canvas shows the failing node
  and an error banner; no partial run persisted unless the workflow itself returns a
  `failed` RunResult (existing behavior) — in that case persist and link to it.
- Cost-limit guard throws before/within a workflow → surfaced as `run-error` with the
  existing message.
- Near-instant mock responses → min display duration keeps animation legible.
- Parallel panelists → concurrent active nodes; totals accumulate as each finishes.
- Client disconnect → stream aborts; server run may still complete and persist.

## 7. Testing
- Unit: `buildWorkflowGraph` returns correct nodes/edges for each of the 5 workflows.
- Unit: event-emitting `runWorkflow` fires events in the right order, planned steps match
  the graph, and emitted totals equal the returned `RunResult` totals (mock provider).
- Existing tests remain green. Lint + typecheck before each commit.

## 8. Dependencies to Add
- `tailwindcss` (v4) + PostCSS pipeline, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, `next-themes`, Radix primitives (via shadcn),
  `recharts` (via shadcn chart), `gsap`.

## 9. Phasing (small commits)
1. Tailwind + shadcn foundation, theming, nav.
2. Workflow graph builder + event types + streaming refactor of `runWorkflow`.
3. `/api/runs/stream` route handler.
4. `OrchestrationCanvas` (GSAP) + `useRunStream` (live + static modes).
5. New Run live integration.
6. Home landing page.
7. Dashboard charts (recharts) + empty/loading states + Run Detail static replay.

## 10. Out of Scope
- Dedicated `/workflows` guide page (**deferred** to a later session).
- Inngest/queue-based execution, Postgres/Prisma migration, real-time multi-user updates,
  auth, and provider changes beyond what already exists.
