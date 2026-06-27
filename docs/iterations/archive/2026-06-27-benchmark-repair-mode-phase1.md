# Benchmark Ingestion + Code-Repair Mode — Phase 1 (archived)

- Merged: PR #3 → `main` as merge commit `f9c80d2` (2026-06-27)
- Spec: `docs/superpowers/specs/2026-06-26-benchmark-ingestion-repair-mode-design.md`
- Plan: `docs/superpowers/plans/2026-06-26-benchmark-ingestion-repair-mode.md`
- Implementer: Grok subagents (Step 4); each task reviewed + full-suite validated by the main agent.

Repurposed OrchestraBench from prose code-review scoring to code-repair benchmarking: workflows emit a fix, the fix runs against a benchmark's tests in an E2B sandbox (behind a `SandboxExecutor` port), and runs are scored on tests passed. QuixBugs is the first ingested source.

## Tasks (commit-tagged)

- [x] Task 1 — Domain types + Zod contracts (`ExecutionResult`, repair-mode run/task shapes). (24899fe)
- [x] Task 2 — Code extractor (`lib/workflows/extract-code.ts`). (f68ebb4)
- [x] Task 3 — `SandboxExecutor` port + `MockSandboxExecutor` (`lib/execution/*`). (d4764fd)
- [x] Task 4 — QuixBugs adapter + ingest script + `upsertBenchmarkTask`. (89e1ca8)
- [x] Task 5 — Repair runner + execution scoring (`scoreExecution`, runner rewrite). (e6aee03)
  - [x] Scope extension: updated the SSE route (`app/api/runs/stream/route.ts`) + its two tests when `runWorkflow`'s new `executor`/`testCode` contract broke that caller (plan had only scheduled the client hook for Task 8); exported `resolveRunInput` for reuse. (e6aee03)
- [x] Task 6 — E2B executor implementation. (1d59f6d) — runtime-unverified until `E2B_API_KEY` is provided.
- [x] Task 7 — Evaluation cleanup (delete dead metrics scorer); `lib/**` typecheck-clean. (9ffb9b7)
- [x] Task 8 — New Run + Run Detail UI for repair results. (dd0b42c)
- [x] Task 9 — Dashboard + datasets guards. (2470eb9)

## Post-PR review remediation

- Security review (Grok `/security-review`): clean — no high-confidence newly introduced host-side vulnerabilities.
- Bundled code review (Grok `/bundled:review`, PENDING review #4585120819): 15 findings.
  - Fixed batch 1 — #1 panel_judge judge emits code, #6 `resolveRunInput` merge, #12 ingest robustness, #15 single-line fences. (309a0cf)
  - Fixed batch 2 — #2 remove dead `createRunAction`, #3+#7 dataset rerun UX. (35fd961)
  - 8 findings deferred to `TODO.md` Future Backlog with rationale.

## Carried forward (still active)

- Verify `QUIXBUGS_COMMIT` pin in `scripts/ingest-benchmark.ts` before the first real `npm run ingest:quixbugs`.
- Live E2B verification once `E2B_API_KEY` is set (the headline path is unproven without it).
- The 8 deferred review findings + Phase 2 (full dashboard repurpose) + Phase 3 (Defects4J / SWE-bench Lite, Vercel Sandbox, Java).
