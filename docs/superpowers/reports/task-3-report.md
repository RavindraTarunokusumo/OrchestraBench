# Task 3 — Streaming API route — Report

## What was built

1. **`lib/store/file-store.ts`**: extracted `saveRun(result: RunResult): Promise<RunResult>`
   which persists an already-computed `RunResult` via the existing `mutateData` queue
   (`data.runs.unshift(result)`), identical to what `createRun` did inline before.
   `createRun` now runs the workflow and delegates to `saveRun(result)`. Net behavior of
   `createRun` is unchanged (verified by existing `tests/workflows.test.ts` staying green).

2. **`app/api/runs/stream/route.ts`** (new): `export const runtime = "nodejs"`. `POST`:
   - Reads/parses JSON body with the same try/catch-wrapped `readJsonBody` helper used by
     the other route handlers in `app/api/*` (local per-route helper, matching existing
     convention rather than a shared util — none existed to reuse).
   - Validates with `createRunSchema` from `lib/api/contracts.ts` (see "shared schema
     decision" below). Invalid input returns `jsonError(400, ...)` with zod details
     **before** any stream is opened, per spec.
   - On valid input, builds a `ReadableStream<Uint8Array>`. In `start(controller)`:
     creates the provider via `createConfiguredProvider()`, calls
     `runWorkflow({ input, provider, onEvent: send })` where `send` encodes
     `data: ${JSON.stringify(event)}\n\n` via `TextEncoder` and enqueues — synchronous
     relative to the awaited runner, so events stay in emission order.
   - After `runWorkflow` resolves, calls `saveRun(result)` and emits `run-final` built from
     the **persisted** result, then `controller.close()` in a `finally`.
   - try/catch wraps the whole workflow+persist sequence: unexpected thrown errors emit
     `run-error` with the error message, then close (no `run-final` in that branch).
   - Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
     `Connection: keep-alive`.

## run-final field mapping

```ts
{
  type: "run-final",
  runId: saved.id,
  status: saved.status,
  costUsd: saved.costUsd,
  latencyMs: saved.latencyMs,
  findingsCount: saved.findings.length,
  qualityScore: saved.evaluation.qualityScore,
  valueScore: saved.evaluation.valueScore
}
```
Confirmed against `lib/domain/types.ts`: `RunResult.costUsd`/`latencyMs`/`status`/`id` are
top-level; `findingsCount` is derived as `findings.length` (no such field on `RunResult`);
`qualityScore`/`valueScore` come from `RunResult.evaluation`, not the top level — exactly as
flagged in the task brief.

## Shared-schema decision

`lib/api/contracts.ts` already exports `createRunSchema` (and `parseRunCreateRequest`,
`formatZodErrors`), and the existing `app/api/runs/route.ts` already validates with
`createRunSchema.safeParse`. That schema's shape matches what the brief described (title/
language/prompt/code/workflow/costLimitUsd, plus optional benchmarkTaskId/knownBugs beyond
the actions.ts subset). No new schema module was needed — the new route imports
`createRunSchema`/`formatZodErrors` directly from `lib/api/contracts.ts`, identical to the
sibling routes (`app/api/runs/route.ts`, `app/api/datasets/route.ts`,
`app/api/datasets/[id]/rerun/route.ts`).

Note: `app/actions.ts` (the server action) still defines its own local, slightly narrower
`runSchema` inline and does not import from `contracts.ts`. That predates this task and was
left untouched per "Keep actions.ts behavior identical" — only the new route was wired to
the shared contracts schema.

## run-error vs failed-run handling

- `runWorkflow` does **not** throw for in-workflow failures (confirmed in
  `lib/workflows/runner.ts`: the `catch` block inside `runWorkflow` returns
  `buildFailedRun(...)`, a normal `RunResult` with `status: "failed"`). That result flows
  through the same success path: persisted via `saveRun`, then a normal `run-final` event
  with `status: "failed"` is emitted. No `run-error` in this case.
- `run-error` is reserved for exceptions thrown *outside* the runner's own try/catch —
  e.g. `createConfiguredProvider()` throwing, or `saveRun` (file I/O) throwing. These are
  caught by the route's outer try/catch, which emits `{ type: "run-error", message }` and
  closes without a `run-final`.

## Tests added (`tests/stream-route.test.ts`)

- `saveRun > persists a pre-computed RunResult without invoking the runner`: builds a
  hand-rolled `RunResult` (no provider/runner call), calls `saveRun`, asserts the returned
  value and `getRun(id)` both equal the hand-rolled object.
- `SSE serialization (route-equivalent) > serializes every emitted WorkflowEvent plus a
  synthesized run-final into valid SSE data lines`: drives `runWorkflow` with an `onEvent`
  that mimics the route's exact serialization (`data: ${JSON.stringify(event)}\n\n`),
  appends a manually-built `run-final` line the same way the route does post-`saveRun`,
  then parses every line back with the `data: ` / `\n\n` envelope check and asserts the
  final event's fields match the persisted run.

No Next server is spun up in tests, per instructions — both tests exercise the underlying
store/runner functions and replicate the route's exact serialization logic in plain
TypeScript.

## Verification tails

- `npm run lint` → "No ESLint warnings or errors"
- `npm run typecheck` → clean (`tsc --noEmit`, no output)
- `npm test` → 6 test files, **37 passed** (35 pre-existing + 2 new in
  `tests/stream-route.test.ts`)
- `npm run build` → succeeded; route table shows `ƒ /api/runs/stream` (147 B) alongside the
  other dynamic API routes, confirming the route compiles under the Next.js build.

## Concerns

- None blocking. One note for whoever builds Task 4's `useRunStream`: the route's
  `run-error` path does not include the run's `status`/`id` (per spec — `run-error` only
  carries `message`), so the client must treat `run-error` as "no run was persisted" and
  `run-final` with `status: "failed"` as "a failed run *was* persisted and has an id" —
  these are different failure modes the UI should distinguish.
- `app/actions.ts`'s local `runSchema` and `lib/api/contracts.ts`'s `createRunSchema` are
  two separate schema definitions with overlapping but not identical shapes (contracts.ts
  additionally allows `benchmarkTaskId`/`knownBugs`). This pre-existed Task 3; left as is
  since the brief said keep `actions.ts` behavior identical and a real "shared module"
  already existed for the API-route side.

## Commits

- `d2f9b20` — feat: extract saveRun from createRun for pre-computed RunResult persistence
- `79349dc` — feat: add SSE streaming route for live workflow run events
