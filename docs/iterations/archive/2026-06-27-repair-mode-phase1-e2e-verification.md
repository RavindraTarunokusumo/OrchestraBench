# Repair Mode — Phase 1 End-to-End Verification (archived)

- Merged: PR #6 → `main` as merge commit `2d8526d` (2026-06-27)
- Type: debugging / verification (no spec; minor patch + live runtime proof)

Closed the two carried-forward Phase 1 items: verifying the QuixBugs ingest pin and proving the headline `model → extract → sandbox → resolved` path on real infrastructure.

## Tasks (commit-tagged)

- [x] 1.1 — Verify + fix the `QUIXBUGS_COMMIT` pin. (bbe76ea)
  - The pinned SHA `a23e533a…` did not exist upstream (GitHub `422`), so `npm run ingest:quixbugs` would have failed at the fetch-by-SHA step. Repinned to the verified master tip `4257f44b…` (reachable via `git ls-remote`).
  - SUBSET fix: `shortest_path_length` has no `json_testcases` entry (custom Python harness with graph structures the JSON adapter can't express) and was silently skipped (9/10). Swapped for `find_in_sorted` (correct source + exact-equality testcases). Live ingest now yields 10/10.
- [x] 1.2 — Live E2B end-to-end verification. (no commit — runtime proof; writes only to gitignored `.data`)
  - `tests/e2b-executor.test.ts` against a real sandbox: `backend: e2b`, resolved, ~2.5s.
  - Full headline path on `quixbugs_gcd` via `single_cheap` (real OpenRouter `…:free` model + real E2B): **status completed, resolved true, 6/6 tests, $0, 12.2s**; extracted candidate was the correct recursive `gcd`.

## Validation

`npm run ingest:quixbugs` 10/10; the E2B integration test passed against a live sandbox; full `npm test` 79 pass / 1 skipped, `tsc` clean, `lint` clean (pre-merge gate on the fix branch).

## Notes

- Phase 1's headline path was "runtime-unverified" at its own archival; it is now proven end-to-end on real OpenRouter + E2B.
- Verification ran in a throwaway `fix-quixbugs-pin` worktree with a copied `.env`; the driver script was deleted, leaving a clean tree.
