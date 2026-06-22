# Database / Persistence

The current MVP persists data locally in `.data/orchestrabench.json`. Prisma and PostgreSQL are present as the target production persistence model, but the application does not yet read or write through Prisma at runtime.

## Current Local Store

`lib/store/file-store.ts` stores one JSON object:

```ts
type AppData = {
  runs: RunResult[];
  datasets: BenchmarkTask[];
};
```

The file store:

- creates `.data/` on demand;
- seeds two benchmark tasks when the JSON file is missing or unreadable;
- stores completed `RunResult` objects at the front of `runs`;
- stores dataset tasks at the front of `datasets`;
- snapshots dataset content into rerun inputs;
- exports the whole payload through `/api/export`.

To reset local data, stop the dev server and remove `.data/orchestrabench.json`.

## Target Prisma Schema

`prisma/schema.prisma` defines the intended PostgreSQL schema:

- `BenchmarkTask`: reusable benchmark task with prompt, code, known bugs, tags, timestamps, and related runs.
- `Run`: task input snapshot, workflow, status, provider label, final answer, cost/latency, escalation/failure metadata, optional dataset link, and related trace/evaluation rows.
- `ModelCall`: per-call role, provider, model, prompt, response, token counts, estimated cost, latency, and optional error.
- `Finding`: structured finding with severity, confidence, source role, optional file/line, and truth state.
- `Evaluation`: one-to-one run evaluation with TP/FP/missed counts, quality score, value score, judge confidence, optional user rating, and notes.

Relationships are one `BenchmarkTask` to many `Run`, one `Run` to many `ModelCall`, one `Run` to many `Finding`, and one `Run` to one optional `Evaluation`.

## Migration Notes

When moving from file-store persistence to Prisma:

- preserve the normalized `RunResult` contract used by the pages;
- keep model-call traces append-only for auditability;
- store dataset reruns as snapshots so historical runs do not change when a dataset task changes later;
- keep value score protected by `max(costUsd, 0.0001)` to support zero-cost mock/free-model runs;
- decide how to represent current JSON-only known bugs and findings before migrating existing `.data` files.
