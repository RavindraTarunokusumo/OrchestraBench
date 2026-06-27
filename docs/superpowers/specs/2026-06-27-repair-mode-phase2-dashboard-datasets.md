# Repair Mode — Phase 2: Dashboard & Datasets Repurpose — Spec

- Date: 2026-06-27
- Status: Draft (pending acceptance)
- Scope: Phase 2 only — fully repurpose the dashboard and datasets pages to **repair metrics** (cross-workflow resolve-rate vs cost comparison), replacing the Phase-1 guards/placeholders. Presentation/aggregation layer only.
- Predecessor: `docs/superpowers/specs/2026-06-26-benchmark-ingestion-repair-mode-design.md` (§3 phasing — "Phase 2 (later spec): Dashboard/datasets pages fully repurposed to repair metrics; cross-workflow resolve-rate vs cost comparison").

## 1. Problem & Goal

Phase 1 repurposed the runner, evaluation, executor, and the New Run / Run Detail pages for code-repair-with-test-execution. It deliberately left the **dashboard and datasets** pages as stopgaps:

- `app/dashboard/page.tsx` renders a placeholder card — *"Repair metrics — full view in Phase 2"* (lines 64–74) — promising interactive charts. The per-workflow comparison **table** already exists and is correct.
- `components/dashboard/workflow-charts.tsx` is an **orphaned, review-era component** (imported nowhere). Its `WorkflowChartRow` still carries a `quality` field that no longer exists in the repair domain (`Evaluation` has `resolved` / `valueScore` / `testsPassed` / `testsTotal`, not `quality`).
- `app/datasets/*` still leans on the review era: the create form collects "Known bug" fields, the detail page lists related runs without an aggregated per-task comparison.

The Phase-1 design (§11) flagged these guards as a stopgap to retire "reasonably soon to avoid a half-migrated UI lingering."

**Goal:** make the dashboard answer the project's headline question — *does multi-model orchestration beat a single model once you account for cost?* — with a live, interactive **resolve-rate vs cost** comparison across workflows, plus a value-score leaderboard; and bring the datasets pages fully into the repair model, including a per-task cross-workflow comparison.

The benchmark's headline questions (SPEC.md §"Questions"): (1) does orchestration beat single-model on resolve rate? (2) how much more does it cost? (3) does cheap-first escalation preserve quality while reducing cost? All three are answered directly by a resolve-rate-vs-cost view segmented by workflow.

## 2. Non-Goals (Phase 2)

- **No domain/type/store/runner/evaluation changes.** Every metric derives from existing `RunResult` fields. This is a presentation + aggregation phase. If a chart wants a number we don't already persist, it is out of scope (revisit in a later phase).
- No new runtime dependency — `recharts ^3.9.0` and the shadcn `components/ui/chart.tsx` wrapper are already present.
- No Phase 3 work (heavy adapters, multi-language, Vercel Sandbox).
- No changes to the New Run / Run Detail / canvas surfaces (Phase 1 owns those).
- The datasets **create form**'s review-era "Known bug" inputs are not redesigned here (manual `source:"manual"` tasks remain expressible); only de-emphasized where it improves the repair-first reading. A full create-form rework is deferred.
- No persisted/export schema change to `app/api/export/route.ts`.

## 3. Current State (grounding)

| Surface | File | Phase-1 state | Phase-2 action |
|---|---|---|---|
| Dashboard summary cards | `app/dashboard/page.tsx` | Total runs / resolve rate / avg value — correct | Keep |
| Dashboard placeholder card | `app/dashboard/page.tsx:64-74` | Stub text "full view in Phase 2" | **Replace** with charts |
| Dashboard comparison table | `app/dashboard/page.tsx:76-109` | Per-workflow resolve rate / value / cost / latency — correct | Keep; feed from shared aggregator |
| Inline `summarize`/`avg` | `app/dashboard/page.tsx:139-159` | Inline, untested | **Extract** to a tested pure module |
| Orphaned charts | `components/dashboard/workflow-charts.tsx` | Review-era (`quality`), unused | **Repurpose** to repair metrics + wire in |
| Chart primitive | `components/ui/chart.tsx` | shadcn/recharts wrapper, sound | Reuse |
| Datasets list | `app/datasets/page.tsx` | Title/source/language/known-bugs | Repair-first columns |
| Dataset detail | `app/datasets/[id]/page.tsx` | Related runs list, no aggregation | Add per-task cross-workflow comparison |
| Home recent/resolve copy | `app/page.tsx` | "for code review" framing | Minor copy correction to repair framing |

Data available per run (no additions): `workflow`, `status`, `evaluation.{resolved,valueScore,testsPassed,testsTotal}`, `costUsd`, `latencyMs`, `benchmarkTaskId`. `valueScore = (resolved ? 1 : testsPassed/max(testsTotal,1)) / max(costUsd, 0.0001)` per `lib/evaluation/score-execution.ts`.

## 4. Data Model

No changes to `lib/domain/types.ts`, the store, or contracts.

New **derived** (in-memory, not persisted) shape produced by the aggregator:

```ts
// lib/dashboard/aggregate.ts
export type WorkflowSummary = {
  workflow: WorkflowKind;
  count: number;            // runs for this workflow in the input set
  resolvedCount: number;
  resolveRate: number;      // resolvedCount / count, 0 when count === 0
  avgValue: number;         // mean evaluation.valueScore
  avgCost: number;          // mean costUsd
  avgLatencyMs: number;     // mean latencyMs
  avgTestPassRate: number;  // mean (testsPassed / max(testsTotal,1))
};

export function summarizeByWorkflow(runs: RunResult[]): WorkflowSummary[];
// Returns one row per workflowKind (all five, stable order), count 0 allowed.
```

The orphaned `WorkflowChartRow` (`{ workflow, quality, value, cost }`) is removed; chart components consume `WorkflowSummary` (or a thin client-safe projection) directly.

## 5. Aggregation Layer

`lib/dashboard/aggregate.ts` — pure, dependency-free, unit-tested.

- `summarizeByWorkflow(runs)` replaces the inline `summarize`/`avg` in the dashboard. Emits all five `workflowKinds` in canonical order so the table and charts share identical row ordering; zero-run workflows yield a zeroed row (callers decide whether to drop them from charts).
- A helper to filter to charted workflows (`count > 0`) lives next to it so the table (shows all, with "—") and the charts (show only workflows that have runs) stay consistent.
- Reused by **both** the dashboard (all runs) and the dataset detail page (runs filtered to one `benchmarkTaskId`).

Consumes: `RunResult[]`, `workflowKinds`. Produces: `WorkflowSummary[]`. No I/O.

## 6. Charts

All chart components are client components (`"use client"`) fed plain serializable rows from the server component. Built on the existing `ChartContainer` / `ChartTooltip` / `ChartTooltipContent` primitives. Reuse the documented recharts-3.x tooltip-typing cast already present in `workflow-charts.tsx`.

### 6.1 Resolve-rate vs cost (centerpiece) — `ResolveRateVsCost`

- Recharts `ScatterChart`. X = `avgCost` (USD), Y = `resolveRate` (0–1, rendered as %). One point per workflow that has runs.
- Encodes the cost/quality frontier: up-and-left is better (higher resolve rate, lower cost). Tooltip shows workflow, resolve rate, avg cost, avg value, run count.
- X domain: `[0, max]` with a small headroom; when all costs sit near the `0.0001` floor (mock backend in local dev) the axis still renders without collapsing (clamp a minimum visible domain). Y domain fixed `[0, 1]` formatted as `%`.
- Point label = workflow short name; color per workflow via `ChartConfig`.

### 6.2 Value-score leaderboard — `ValueLeaderboard` (repurposed from `WorkflowCharts`)

- Recharts `BarChart`, `avgValue` per workflow, descending. Compact axis formatting (value scores can reach tens of thousands — keep the existing `Intl.NumberFormat` compact formatter).
- Replaces the orphaned "Value score leaderboard" + "Quality vs cost" pair; the `quality` series is dropped entirely.

### 6.3 Composition

The dashboard placeholder card (lines 64–74) is replaced by a section rendering 6.1 + 6.2 side-by-side (responsive `lg:grid-cols-2`, stack on mobile), under a heading like "Resolve rate vs cost". The existing comparison table stays beneath as the precise tabular companion.

`components/dashboard/workflow-charts.tsx` is rewritten (or split) to export the repair-mode chart(s); whichever file layout is cleaner, the review-era `WorkflowChartRow`/`quality` must be gone.

## 7. Datasets Repurpose

### 7.1 List — `app/datasets/page.tsx`

- Keep the saved-tasks table but make the columns repair-first: Title, Source, Language, and a **repair signal** (e.g. number of related runs and best resolve outcome) instead of leading with "known bugs". Known-bug count may remain as a secondary/legacy column only when present.
- The create form is retained as-is functionally (no schema change); copy may be lightly adjusted but the "Known bug" fields stay for `source:"manual"` tasks (Non-Goal to redesign).

### 7.2 Detail — `app/datasets/[id]/page.tsx`

- Add a **per-task cross-workflow comparison**: run `summarizeByWorkflow(relatedRuns)` and render resolve rate / value / cost / latency per workflow for this single task — the per-task version of the dashboard headline. A compact table is sufficient; a small reuse of the resolve-vs-cost scatter is optional if data ≥ 2 workflows.
- Keep the existing Task panel (buggy code, test code, reveal-answer-key) and Rerun form unchanged.
- The "Related runs" list stays; the new comparison sits above or beside it.

## 8. Edge Cases

- **Zero runs:** dashboard keeps its existing empty state; no chart section renders. Dataset detail with no related runs keeps "No reruns yet."
- **Workflows with zero runs:** excluded from charts (no phantom origin points / empty bars); still shown in the table as "—".
- **Single workflow / single run:** scatter renders one point, leaderboard one bar — must not error.
- **Degenerate cost axis** (all costs at the `0.0001` floor under the mock backend): clamp a minimum X domain so points don't stack on the axis; document that local mock runs report floor cost.
- **Large value scores:** compact tick formatting (existing pattern).
- **Legacy persisted runs** without an `execution`/repair-shaped `evaluation` (TODO backlog #4): out of scope to fix here, but the aggregator must not throw on a missing/0 `valueScore`/`testsTotal` — guard with `max(testsTotal,1)` and nullish defaults so old local `.data` can't crash the dashboard.

## 9. Interfaces / Build Order (for the lightweight plan)

1. `lib/dashboard/aggregate.ts` — `summarizeByWorkflow` + chartable filter. *(pure; tested first)*
2. Unit tests `lib/dashboard/aggregate.test.ts` — empty, single-run, multi-workflow, zero-run workflow, degenerate cost, missing-field guard.
3. Dashboard server page — replace inline `summarize`/`avg` with the module; feed table from `WorkflowSummary`. No visual change yet. *(verify table parity)*
4. Repair-mode chart components (`ResolveRateVsCost`, `ValueLeaderboard`) — rewrite `components/dashboard/workflow-charts.tsx`; drop `quality`.
5. Wire charts into the dashboard, deleting the placeholder card (lines 64–74).
6. Dataset detail — per-task `summarizeByWorkflow(relatedRuns)` comparison.
7. Datasets list — repair-first columns.
8. Home copy correction (repair framing) — minor.

Each is its own commit (Workflow Rule 1). Steps 1–2 gate the rest (shared contract). Steps 4–5 depend on 1; 6–7 depend on 1; 3 depends on 1. Steps 4/6/7/8 are largely independent of each other (disjoint files) once 1 lands — candidate for parallel implementer handoffs.

## 10. Testing

Per `docs/testing.md` (Vitest, `fileParallelism: false`):

- **Aggregator unit tests** are the core gate (pure function, deterministic): resolve rate, averages, ordering across all five `workflowKinds`, zero-run workflow rows, single run, missing-field guard, per-task filtering equivalence.
- Charts are presentational client components; no new component-test harness is introduced (the project has no existing component tests). Correctness is enforced at the aggregator boundary that feeds them.
- Full `npm test` + `npx tsc --noEmit` + `npm run lint` green after each task (Workflow Rule 10).

## 11. Success Criteria

- Dashboard placeholder card is gone, replaced by a live **resolve-rate-vs-cost** scatter + **value-score leaderboard**, both reading real runs and updating as runs accrue.
- Dataset detail shows a per-workflow comparison for that task's related runs.
- Datasets list reads repair-first.
- No reference to the removed review-era `quality` metric anywhere; `WorkflowChartRow` is deleted.
- Aggregation logic is a shared, unit-tested pure module used by dashboard + dataset detail (no duplicated inline averaging).
- No changes under `lib/domain`, `lib/store`, `lib/workflows`, `lib/evaluation`, `lib/api`, or the API routes.
- Full test suite, typecheck, and lint pass.

## 12. Risks & Open Questions

- **recharts 3.x + shadcn tooltip typing** already needed a cast (documented in `workflow-charts.tsx`); the scatter tooltip may need the same treatment. Reuse the documented pattern; do not loosen `chart.tsx` types.
- **Degenerate cost axis** under the mock backend (local dev without `E2B_API_KEY`) makes the scatter cluster near the cost floor. Acceptable for Phase 2; noted in §8. Real E2B runs spread the axis.
- **Half-migrated datasets create form** — keeping the review-era known-bug inputs is a deliberate Non-Goal; flag if it reads inconsistently after the list/detail repurpose.

### Decisions taken (defaults; flag in review if you disagree)

1. **Resolve-rate vs cost = scatter** (one point per workflow), not grouped bars — it expresses the cost/quality tradeoff frontier directly. *(Recommended.)*
2. **No create-form redesign** in Phase 2 — known-bug inputs stay for manual tasks. *(Keeps the phase tight; defer.)*
3. **Aggregator extracted to `lib/dashboard/aggregate.ts`** and shared by dashboard + dataset detail, rather than duplicating per-task averaging inline.
