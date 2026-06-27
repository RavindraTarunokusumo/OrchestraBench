# Repair Mode — Phase 2 (Dashboard & Datasets) — Lightweight Implementation Plan

> Contract for Grok implementer handoffs. Spec: `docs/superpowers/specs/2026-06-27-repair-mode-phase2-dashboard-datasets.md`. This plan is the **cross-task contract** (who consumes/produces what, build order, parallelism) — implementers regenerate the per-step code from it. No verbatim code or shell commands inlined by design (per CLAUDE.md Step 3).

**Goal:** Replace the dashboard Phase-1 placeholder with a live resolve-rate-vs-cost scatter + value-score leaderboard, repurpose the orphaned review-era `workflow-charts.tsx`, extract a shared tested aggregator, and bring the datasets pages into the repair model. Presentation/aggregation only.

## Global Constraints

- Vitest, `fileParallelism: false` (do not change). Full suite `npm test`; single file `npx vitest run <path>`.
- Path alias `@/` → repo root.
- **Presentation/aggregation only.** No edits under `lib/domain`, `lib/store`, `lib/workflows`, `lib/evaluation`, `lib/api`, or `app/api/**`. If a chart needs a number not already on `RunResult`, it is out of scope — stop and flag.
- Chart components are `"use client"`; server pages stay server components and pass plain serializable rows.
- Reuse the existing recharts-3.x tooltip-typing cast pattern in `components/dashboard/workflow-charts.tsx`; do **not** loosen `components/ui/chart.tsx` types.
- Specific staging only; one deliverable per commit; git note after each (concise manual note — `.github/git_notes_template.md` is absent).
- Implementer self-check is the **full** `npm test` + `npx tsc --noEmit`, not just the new test file. No git operations by the implementer.

## The cross-task contract (lynchpin)

Everything keys off one pure module. Define it exactly once; all consumers import it.

```
lib/dashboard/aggregate.ts  (new, pure, no I/O)
  type WorkflowSummary = {
    workflow: WorkflowKind;
    count: number;
    resolvedCount: number;
    resolveRate: number;       // resolvedCount/count; 0 when count===0
    avgValue: number;          // mean evaluation.valueScore; 0 when count===0
    avgCost: number;           // mean costUsd
    avgLatencyMs: number;      // mean latencyMs
    avgTestPassRate: number;   // mean(testsPassed / max(testsTotal,1))
  }
  summarizeByWorkflow(runs: RunResult[]): WorkflowSummary[]
    // one row per workflowKinds entry, canonical order, count 0 allowed.
    // Guard every field against missing/0 (legacy runs): nullish→0, max(testsTotal,1).
  chartableSummaries(s: WorkflowSummary[]): WorkflowSummary[]   // filter count>0
```

Consumers:
- `app/dashboard/page.tsx` → table (all five rows) + charts (chartable only) + the three summary cards.
- `app/datasets/[id]/page.tsx` → `summarizeByWorkflow(relatedRuns)` for the per-task comparison.

Chart component prop contract (client-safe projection of `WorkflowSummary`):

```
components/dashboard/workflow-charts.tsx  ("use client")
  type WorkflowChartRow = { workflow: string; resolveRate: number; avgValue: number; avgCost: number; count: number }
  WorkflowCharts({ rows }: { rows: WorkflowChartRow[] })
    // renders ResolveRateVsCost (ScatterChart: X=avgCost, Y=resolveRate%) + ValueLeaderboard (BarChart avgValue desc)
    // empty rows → render nothing (caller gates on runs.length).
```
The old `WorkflowChartRow` (`{workflow,quality,value,cost}`) and the `quality` series are deleted.

## Tasks

### Task 1 — Aggregator + tests  *(gating; must land first)*
- New: `lib/dashboard/aggregate.ts` (`summarizeByWorkflow`, `chartableSummaries`, `WorkflowSummary`).
- New: `lib/dashboard/aggregate.test.ts`.
- **Consumes:** `RunResult`, `workflowKinds` from `@/lib/domain/types`. **Produces:** the contract above.
- Tests (the core gate): empty input → five zeroed rows in canonical order; single run; multi-workflow averages; a workflow with zero runs stays a zeroed row; degenerate cost (all at floor) still averages; missing/legacy fields don't throw; per-task filtering equivalence (`summarizeByWorkflow(filtered)` matches a hand-computed subset).
- TDD: write the failing test first.

### Task 2 — Dashboard wiring (aggregator + charts)  *(one file: `app/dashboard/page.tsx`)*
- Replace the inline `summarize`/`avg` (lines ~139–159) with `summarizeByWorkflow`; re-point the table cells to the new field names (`avgValue`/`avgCost`/`avgLatencyMs`/`resolveRate`/`resolvedCount`/`count`). Table output must stay visually identical.
- Delete the placeholder card (lines ~64–74); render `<WorkflowCharts rows={chartableSummaries(summaries).map(toRow)} />` in its place under a "Resolve rate vs cost" heading.
- Keep the three summary cards (total runs / resolve rate / avg value).
- **Consumes:** Task 1 + Task 3 component. **Produces:** live dashboard.
- Land as two commits if cleaner (aggregator swap → table parity; then chart wiring), but same file so one implementer owns it.

### Task 3 — Repair-mode chart component  *(one file: `components/dashboard/workflow-charts.tsx`)*
- Rewrite to the `WorkflowCharts({ rows })` contract above: `ResolveRateVsCost` scatter + `ValueLeaderboard` bar. Drop `quality` entirely.
- Scatter: Y domain `[0,1]` as `%`; X domain `[0, max*headroom]` clamped to a small minimum so floor-cost points don't collapse onto the axis; per-workflow color via `ChartConfig`; tooltip shows workflow / resolve rate / avg cost / avg value / count. Keep the compact value-axis formatter on the leaderboard.
- **Consumes:** `WorkflowChartRow[]`, existing `chart.tsx` primitives. **Produces:** `WorkflowCharts`.
- Independent of Tasks 4/5; Task 2 depends on this.

### Task 4 — Dataset detail per-task comparison  *(one file: `app/datasets/[id]/page.tsx`)*
- Add a per-workflow comparison built from `summarizeByWorkflow(relatedRuns)` (compact table; optionally the scatter when ≥2 workflows have runs). Place above/beside the existing "Related runs" list. Leave Task panel + Rerun form untouched.
- **Consumes:** Task 1. **Produces:** per-task comparison.

### Task 5 — Datasets list repair-first  *(one file: `app/datasets/page.tsx`)*
- Make columns repair-first (Title, Source, Language, repair signal — related-run count / best resolve outcome). Known-bug count stays only as a secondary column when present. Create form unchanged.
- **Consumes:** `listRuns`/`listDatasets` (read-only). **Produces:** repaired list.

### Task 6 — Home copy correction  *(one file: `app/page.tsx`)*  *(trivial)*
- Replace "for code review" framing with repair framing in the hero/section copy. No structural change.

## Build Order & Parallelism

1. **Task 1** lands first (shared contract; gates all others).
2. Then **Task 3** (chart component), then **Task 2** (dashboard wiring needs the component) — same charts stream, sequential.
3. **Tasks 4, 5, 6** depend only on Task 1 and touch disjoint files → eligible to run after Task 1, independently of the charts stream and each other.

Default execution: **sequential in this worktree** (1 → 3 → 2 → 4 → 5 → 6). Parallel isolated-worktree handoffs are possible (disjoint files) but rejected here because per-worktree `npm install` is slow/flaky on OneDrive (insights.md) and the tasks are small. Orchestrator runs the full suite + typecheck + lint after each task regardless (Workflow Rule 10).

## Risks

- recharts 3.x + shadcn tooltip generics — reuse the documented cast; the scatter tooltip may need the same. Watch `tsc`.
- Degenerate cost axis under the mock backend (local dev) — clamp min X domain; acceptable per spec §8/§12.
- Table parity regression when swapping to the aggregator — verify the table renders the same numbers before/after (Task 2).
- Legacy local `.data` runs missing repair fields must not crash the aggregator — field guards in Task 1.
