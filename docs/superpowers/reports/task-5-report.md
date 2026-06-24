# Task 5 Report — New Run page live integration

## What changed

1. **`components/orchestration/use-run-stream.ts` + `tests/use-run-stream.test.ts`**
   Extended the hook's state with `finalSummary: RunFinalSummary | null` (`status`,
   `costUsd`, `latencyMs`, `findingsCount`, `qualityScore`, `valueScore`), populated
   directly from the `run-final` event in the pure `reduceStreamEvent` reducer and reset
   to `null` on `run-init` / `start()`. No other behavior changed. Added assertions to
   the existing `run-final` (completed and failed) test cases to cover the new field.

2. **`app/runs/new/new-run-client.tsx`** (new) — client component rendering the form with
   shadcn `Card`/`Label`/`Input`/`Textarea`/`Select`/`Button`, same field set and defaults
   as the old page (title "Review auth helper", language "TypeScript", review-instructions
   prompt, the nullable `canDelete` snippet, workflow default `cheap_first`, optional
   `costLimitUsd`). On submit it does basic non-empty validation, parses `costLimitUsd`
   (rejecting non-positive values), then calls `useRunStream().start(...)` instead of the
   server action. While `status === "running"` or terminal, an `OrchestrationCanvas
   mode="live"` card renders above the form; the form stays visible but is dimmed/disabled
   (`disabled={isRunning}` on every field + submit button) rather than being replaced, so
   users can see the run config they submitted. On `complete`/`failed` a stat grid
   (status, quality score, value score, findings, cost, latency) appears under the canvas
   plus a "View full report" `Button asChild` → `next/link` to `/runs/${finalRunId}` and a
   "Run another" button that re-invokes `start()` with the default field values. On
   `status === "error"`, a destructive-styled `Card` shows the hook's `error` message with
   a dismiss action (the existing form below is still submittable for retry — no special
   retry plumbing needed since `start()` is idempotent and resettable).

3. **`app/runs/new/page.tsx`** — now a thin server component: page heading + description
   (Tailwind classes) and `<NewRunClient />`. All legacy `.container/.panel/.field/.grid
   .two` classes removed from this route.

## Why the hook was extended

`qualityScore`/`valueScore`/`findingsCount` only exist on the `run-final` wire event and
were previously dropped by the reducer (only `costUsd`/`latencyMs` were folded into
`totals`). The summary card needs all of them, so capturing them as a small immutable
snapshot (`finalSummary`) on the existing pure reducer was the minimal-diff option —
no new effects, no new component state, and the reducer stays unit-testable in isolation.

## Error / retry / reset behavior

- **Validation errors** (empty fields, bad cost limit) are caught client-side before
  calling `start()` and shown inline under the config card; no network call is made.
- **`status === "error"`** (network failure, non-2xx, stream read failure) surfaces the
  hook's `error` string in a destructive card; the form underneath is untouched and still
  enabled, so resubmitting calls `start()` again — no separate "retry" code path needed.
- **"Run another"** resets to the page defaults and starts a fresh run; it does not clear
  the user's edited form fields' local state (only the stream state resets), which matches
  "offer a reset action" rather than full form-clearing — the live canvas/summary disappear
  once `start()` flips `status` back to `"running"`.

## Verification

- `npm run typecheck` — pass, no errors.
- `npm run lint` — pass, no ESLint warnings.
- `npm test` — **50/50 tests pass** (7 files), including the extended
  `tests/use-run-stream.test.ts` (13 tests).
- `npm run build` — pass; `/runs/new` builds as a static route (63.4 kB page,
  180 kB first load JS), no build-time errors.

## Concerns

- None blocking. `Select`'s `disabled` prop and `onValueChange` are standard Radix props
  confirmed via `components/ui/select.tsx` and typecheck/build success.
- The legacy `createRunAction` server action in `app/actions.ts` is left untouched and now
  has no caller in `app/runs/new` (out of scope per instructions — other code may still
  reference it; not deleted).
