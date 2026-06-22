---
description: |
  Weekly integrated agentic codebase check-up. A normal GitHub Actions job
  collects deterministic code-quality, complexity, security, dependency, and
  Graphify evidence as an artifact. The LLM agent then triages that artifact and
  creates a GitHub issue only when actionable follow-up work is warranted.

on:
  schedule:
    - cron: 'weekly on monday'
  workflow_dispatch:

permissions:
  actions: read
  contents: read
  issues: read
  pull-requests: read

env:
  CODE_HEALTH_DIR: /tmp/code-health

network: defaults

engine:
  id: copilot
  model: gpt-5.3-codex

tools:
  github:

safe-outputs:
  create-issue:
    title-prefix: "[code-health] "
    labels: [code-health, technical-debt, agent-proposed]
    max: 4
  noop:
    max: 1
    report-as-issue: false

steps:
  - name: Checkout repository
    uses: actions/checkout@v6
    with:
      persist-credentials: false

  - name: Download code-health evidence
    uses: actions/download-artifact@v6
    with:
      name: code-health-evidence
      path: artifacts/code-health-evidence

  - name: Verify code-health evidence
    shell: bash
    run: |
      test -f artifacts/code-health-evidence/EVIDENCE_INDEX.md
      test -f artifacts/code-health-evidence/tool-availability.txt
      test -f artifacts/code-health-evidence/ruff-check.txt
      test -f artifacts/code-health-evidence/pytest.txt

jobs:
  collect-evidence:
    name: Collect deterministic code-health evidence
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Set up Python
        uses: actions/setup-python@v6
        with:
          python-version: '3.10'
          cache: pip

      - name: Set up Node
        uses: actions/setup-node@v5
        with:
          node-version: '20'

      - name: Install Python dependencies and audit tools
        shell: bash
        run: |
          set +e
          mkdir -p "$CODE_HEALTH_DIR"
          python -m venv .venv > "$CODE_HEALTH_DIR/setup-venv.txt" 2>&1
          source .venv/bin/activate
          python -m pip install --upgrade pip > "$CODE_HEALTH_DIR/setup-pip-upgrade.txt" 2>&1
          python -m pip install -r requirements.txt > "$CODE_HEALTH_DIR/setup-requirements.txt" 2>&1
          python -m pip install ruff pytest pytest-cov radon xenon lizard vulture deptry bandit pip-audit basedpyright > "$CODE_HEALTH_DIR/setup-checkup-tools.txt" 2>&1
          {
            echo "python=$(command -v python || true)"
            echo "pip=$(command -v pip || true)"
            echo "ruff=$(command -v ruff || true)"
            echo "pytest=$(command -v pytest || true)"
            echo "radon=$(command -v radon || true)"
            echo "xenon=$(command -v xenon || true)"
            echo "lizard=$(command -v lizard || true)"
            echo "vulture=$(command -v vulture || true)"
            echo "deptry=$(command -v deptry || true)"
            echo "bandit=$(command -v bandit || true)"
            echo "pip-audit=$(command -v pip-audit || true)"
            echo "basedpyright=$(command -v basedpyright || true)"
            echo "node=$(command -v node || true)"
            echo "npm=$(command -v npm || true)"
            echo "npx=$(command -v npx || true)"
          } > "$CODE_HEALTH_DIR/tool-availability.txt" 2>&1

      - name: Run code-health checks
        shell: bash
        run: |
          set +e
          source .venv/bin/activate || true
          mkdir -p "$CODE_HEALTH_DIR"

          ruff check . > "$CODE_HEALTH_DIR/ruff-check.txt" 2>&1 || true
          ruff format --check . > "$CODE_HEALTH_DIR/ruff-format.txt" 2>&1 || true
          pytest src/tests > "$CODE_HEALTH_DIR/pytest.txt" 2>&1 || true
          npx eslint app/ > "$CODE_HEALTH_DIR/eslint.txt" 2>&1 || true

          radon cc src -s -a > "$CODE_HEALTH_DIR/radon-cc.txt" 2>&1 || true
          radon mi src -s > "$CODE_HEALTH_DIR/radon-mi.txt" 2>&1 || true
          xenon --max-absolute B --max-modules B --max-average A src > "$CODE_HEALTH_DIR/xenon.txt" 2>&1 || true
          lizard src > "$CODE_HEALTH_DIR/lizard.txt" 2>&1 || true

          vulture src --min-confidence 80 > "$CODE_HEALTH_DIR/vulture.txt" 2>&1 || true
          deptry . > "$CODE_HEALTH_DIR/deptry.txt" 2>&1 || true
          pip-audit > "$CODE_HEALTH_DIR/pip-audit.txt" 2>&1 || true
          bandit -r src > "$CODE_HEALTH_DIR/bandit.txt" 2>&1 || true
          basedpyright src > "$CODE_HEALTH_DIR/basedpyright.txt" 2>&1 || true

          git status --short > "$CODE_HEALTH_DIR/git-status.txt" 2>&1 || true

      - name: Capture Graphify snapshot context
        shell: bash
        run: |
          set +e
          mkdir -p "$CODE_HEALTH_DIR"
          if [ -f graphify-out/GRAPH_REPORT.md ]; then
            cp graphify-out/GRAPH_REPORT.md "$CODE_HEALTH_DIR/graphify-graph-report.md"
          fi
          if [ -d graphify-out ]; then
            find graphify-out -maxdepth 2 -type f | sort > "$CODE_HEALTH_DIR/graphify-files.txt"
          else
            echo "graphify-out directory not present" > "$CODE_HEALTH_DIR/graphify-files.txt"
          fi

      - name: Create compact evidence index
        shell: bash
        run: |
          set +e
          {
            echo "# Code Health Evidence Index"
            echo
            echo "Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
            echo "Commit: ${GITHUB_SHA}"
            echo
            echo "## Files"
            find "$CODE_HEALTH_DIR" -maxdepth 1 -type f -printf '- %f\n' | sort
            echo
            echo "## Tool Availability"
            cat "$CODE_HEALTH_DIR/tool-availability.txt" 2>/dev/null || true
            echo
            echo "## Setup Tail"
            for f in setup-venv.txt setup-pip-upgrade.txt setup-requirements.txt setup-checkup-tools.txt; do
              echo "### $f"
              tail -80 "$CODE_HEALTH_DIR/$f" 2>/dev/null || true
              echo
            done
          } > "$CODE_HEALTH_DIR/EVIDENCE_INDEX.md"

      - name: Upload code-health evidence
        uses: actions/upload-artifact@v7
        with:
          name: code-health-evidence
          path: /tmp/code-health
          if-no-files-found: warn
          retention-days: 14

---
# Weekly Codebase Check-Up

You are the weekly code-health auditor for Nexus Lite, a private FastAPI application with background workers, PostgreSQL plus pgvector, Redis, local embeddings, an LLM gateway, and an ingestion-to-brief pipeline.

A normal GitHub Actions job named `collect-evidence` runs before you. It collects deterministic scanner outputs into an artifact named `code-health-evidence`. Your job is to download/read that artifact, incorporate Graphify context, triage the evidence, and create scoped GitHub issues only when actionable follow-up work is warranted.

Do not modify repository files. Do not open a PR. Do not perform broad cleanup. This workflow is inspection, triage, and issue creation only.

## Operating principles

- Deterministic tool output is the evidence layer.
- Your agentic role is triage, prioritization, and issue writing.
- Graphify findings must be incorporated into your context before final triage.
- Prefer small, reviewable follow-up tasks over broad cleanup proposals.
- Treat ingestion, document cleaning, chunking, embeddings, claim extraction, retrieval, synthesis, query answering, worker orchestration, scheduler, database, secrets, and deployment code as higher risk.
- Do not recommend behavior-changing refactors casually.
- Do not create an issue when the run is clean or only contains low-confidence/noisy findings.
- Do create an issue when the workflow cannot run its core audit tools and therefore cannot verify code health.
- If you create issues, group them into a small number of remediation buckets so future remediation agents do not spend duplicate context-loading and startup cost.

## Required context to read first

Read these repository files before interpreting the audit:

- `README.md`
- `TODO.md`
- `AGENTS.md`
- `requirements.txt`
- `.github/workflows/doc-freshness.md`
- `.github/workflows/daily-repo-status.md`
- `docs/architecture.md` if present
- `docs/testing.md` if present

Use GitHub tools if filesystem reading is unavailable.

## Evidence artifact to inspect

Download or inspect the `code-health-evidence` artifact from the current workflow run. It should contain:

- `EVIDENCE_INDEX.md`
- `tool-availability.txt`
- `setup-venv.txt`
- `setup-pip-upgrade.txt`
- `setup-requirements.txt`
- `setup-checkup-tools.txt`
- `ruff-check.txt`
- `ruff-format.txt`
- `pytest.txt`
- `eslint.txt`
- `radon-cc.txt`
- `radon-mi.txt`
- `xenon.txt`
- `lizard.txt`
- `vulture.txt`
- `deptry.txt`
- `pip-audit.txt`
- `bandit.txt`
- `basedpyright.txt`
- `git-status.txt`
- `graphify-graph-report.md` if available
- `graphify-files.txt`

Do not attempt to reinstall the scanner tools inside the agent runtime unless the artifact is missing. The scanner tools are intentionally run in the `collect-evidence` job to avoid agent-runtime proxy/package-install limitations.

## Core audit blocked rule

Before deciding whether to create an issue, determine whether the artifact contains enough deterministic evidence to be meaningful.

The audit is considered **blocked** if most core checks could not run because tools were unavailable, dependency installation failed, network/proxy restrictions blocked package installation, or the workflow environment prevented scanner execution.

Core checks are:

- `ruff check`
- `ruff format --check`
- `pytest src/tests`
- at least one complexity scanner: `radon`, `xenon`, or `lizard`
- at least one security/dependency scanner: `bandit`, `pip-audit`, or `deptry`

If the audit is blocked, create a GitHub issue even if no repository code defect was proven. Classify it as workflow/tooling debt, not application-code debt. Do not use `noop` for a blocked audit.

For blocked audits, use this issue title:

```text
Weekly Codebase Check-Up Blocked — YYYY-MM-DD
```

The issue should include:

```markdown
## Summary
- Overall status: Blocked
- Reason: core audit tools could not run
- Likely cause: network/proxy restriction / package install failure / missing Node/npm project setup / unknown
- Code defect evidence produced: Yes / No
- Graphify context: Available / Partially available / Unavailable

## Failed Setup / Tooling Evidence
Summarize setup logs, tool availability, and command failures.

## What Still Worked
Mention any checks or Graphify/source context that did work.

## Recommended Fix
- [ ] Decide whether this workflow should use dependency caching, a prebuilt tool image, or repo-pinned tool dependencies.
- [ ] Re-run the workflow after toolchain availability is fixed.

## Guardrail
No application code defect should be inferred from this blocked run alone.
```

## Graphify context requirement

Graphify findings must be part of final triage.

Prefer `graphify-graph-report.md` from the evidence artifact. If unavailable, inspect `graphify-files.txt` and then relevant repository files. Do not rebuild or update the graph in this workflow.

Use Graphify to weight findings. A complex function in a highly central execution module is more important than a complex helper in a low-risk script.

## Triage rules

Create an issue when at least one of these is true:

- The audit is blocked under the **Core audit blocked rule**.
- Tests fail for reasons that look like real repo failures.
- Ruff finds real lint/format issues.
- Bandit reports medium/high findings or findings involving live trading, secrets, auth, requests, config, or exchange integration.
- `pip-audit` reports vulnerable dependencies.
- Complexity tools flag clear hotspots in central or high-risk modules.
- Graphify suggests architecture coupling or boundary drift that matches tool findings.
- Vulture/Deptry findings are high-confidence and likely actionable.
- The workflow cannot run key checks because of a repository setup issue that should be fixed.

Do not create an issue for:

- low-confidence Vulture noise,
- missing optional tools such as Graphify or `npx` when core audit evidence still exists,
- style preferences,
- broad architectural opinions without concrete paths or tool evidence,
- a clean run with no meaningful follow-up.

Important: a blocked audit is not a clean run. If core tools cannot run, create a blocked-audit issue.

## Risk buckets

Classify each actionable finding:

### A — Safe cleanup candidate

Examples:

- Ruff-only issues
- formatting drift
- obvious unused imports
- simple dead local variables

Recommended next step: small cleanup PR may be acceptable.

### B — Refactor candidate

Examples:

- complex functions
- oversized modules
- duplication
- maintainability warnings

Recommended next step: create one grouped refactor issue covering the related high-complexity hotspots. Do not create one issue per function.

### C — High-risk scoped remediation

Examples:

- live trading execution
- Binance integration
- order sizing
- stop loss / take profit behavior
- strategy signal logic
- backtest correctness
- database schema changes
- deployment or secrets handling

Recommended next step: include the high-risk function in the grouped refactor issue with explicit behavior-preservation notes, characterization-test requirements, and acceptance checks.

### D — Report only

Examples:

- low-confidence Vulture output
- optional dependency cleanup
- ambiguous architecture concerns
- optional tool failures when core audit evidence still exists

Recommended next step: mention only if useful; otherwise noop.

### E — Workflow/tooling debt

Examples:

- dependency installation fails before core tools are available
- core scanners cannot run because the GitHub Actions environment lacks required runtime support
- tool PATH/global npm location failures prevent the audit from producing evidence
- the evidence artifact is missing or incomplete

Recommended next step: create a blocked-audit issue. Do not infer application-code defects from this alone.

## Issue creation policy

Create at most four GitHub issues per run.

If the audit is blocked, use the blocked-audit title and format from the **Core audit blocked rule**.

If application-code action is needed, create one issue per remediation bucket, not one issue per finding.

Use this bucket split:

- One dependency/security bucket for vulnerable packages and declaration drift.
- One grouped refactor bucket for all high-complexity code hotspots that are suitable for behavior-preserving refactor PRs.
- One test/lint bucket for failing tests, ruff/format issues, or focused JavaScript lint cleanup.
- One workflow/tooling bucket for blocked audit infrastructure or environment failures.

When there are too many actionable findings for a bucket, include the highest-risk findings first. Prioritize ingestion, retrieval, synthesis, query answering, worker orchestration, scheduler, database, secrets, and deployment paths. Mention omitted lower-priority findings in the bucket issue's "Deferred Findings" section.

Do not split high-complexity refactors into separate issues solely because they involve different functions. The goal is one grouped refactor issue and one grouped refactor PR to reduce token cost and Copilot rate-limit pressure. Keep dependency/security and workflow/tooling buckets separate from the refactor bucket.

Use this title format for each application-code issue:

```text
Weekly Codebase Check-Up — YYYY-MM-DD — <bucket name>
```

The safe-output configuration adds the `[code-health]` prefix. Do not include it yourself.

Use this body format for application-code findings. Each issue body must be self-contained and must include only the findings in that bucket.

```markdown
## Summary
- Overall status: Pass / Needs attention / Blocked
- Issue severity: Low / Medium / High
- Recommended next step: Small cleanup PR / Grouped refactor PR / Dependency patch PR / Workflow fix PR
- Remediation bucket: Dependency/security / Refactor hotspots / Test-lint cleanup / Workflow-tooling
- Remediation scope: one sentence naming the package cluster, commands, files/functions, or workflow to fix
- Graphify context: Available / Partially available / Unavailable

## Tool Evidence
| Check | Status | Notes |
| --- | --- | --- |
| ruff check | ... | ... |
| ruff format | ... | ... |
| pytest | ... | ... |
| eslint | ... | ... |
| radon/xenon/lizard | ... | ... |
| vulture | ... | ... |
| deptry | ... | ... |
| pip-audit | ... | ... |
| bandit | ... | ... |
| basedpyright | ... | ... |

## Graphify Findings
Summarize only the Graphify context relevant to this issue's scope.

## Actionable Findings

### Finding N: short title
- Bucket: A / B / C / D / E
- Evidence: command + relevant excerpt
- Files involved: paths
- Functions involved: exact function names, when applicable
- Why it matters: concise explanation
- Required remediation: concrete action the remediation workflow should implement
- Acceptance checks: exact tests or commands the remediation workflow should run
- Risk notes: especially if trading execution, strategy behavior, backtesting, secrets, or deployment are involved

## Refactor Plan
- Required for refactor bucket issues only.
- List every high-complexity function included in this grouped issue.
- For each function, name the intended behavior-preserving extraction target and the targeted characterization tests.
- State that the remediation workflow should open one PR for the grouped refactor bucket.

## Scope Boundary
- In scope: exact files/functions/packages this bucket is allowed to change.
- Out of scope: unrelated buckets intentionally split into separate issues.

## Deferred Findings
- Optional. Use only when lower-priority findings were omitted from the current bucket.

## Non-Actionable Noise Ignored
Mention noisy categories you intentionally ignored and why.
```

## Noop policy

Use `noop` only when no issue is necessary and the audit produced enough deterministic evidence to be meaningful.

Do not use `noop` when core audit tools could not run.

Noop format:

```markdown
Weekly codebase check-up completed. No GitHub issue created because no actionable maintenance item crossed the threshold.

Summary:
- Tests: ...
- Lint/format: ...
- Security/dependencies: ...
- Complexity: ...
- Graphify context: ...
- Notes: ...
```

## Hard constraints

- Do not edit files.
- Do not create PRs.
- Do not create more than four issues.
- Do not recommend broad codebase cleanup.
- Do group high-complexity refactor findings into one refactor issue when they can be handled with behavior-preserving extractions in one PR.
- Do not suggest changing trading behavior casually.
- Do not hide failed checks. If a tool fails, say why and whether that failure itself is actionable.
- Treat live trading, exchange integration, order execution, TP/SL, strategy signals, backtesting correctness, secrets, and deployment as high-risk areas.
- Prefer small, reviewable follow-up tasks over large refactor plans.

---
---
description: |
  Automatic remediation workflow for Weekly Codebase Check-Up issues. It reads
  generated code-health reports, resolves concrete findings across the codebase,
  and opens a pull request with verification evidence.

on:
  issues:
    types:
      - opened
      - edited
      - labeled
  workflow_dispatch:
    inputs:
      issue_number:
        description: Code-health issue number to remediate
        required: false
        type: string

permissions:
  contents: read
  issues: read
  pull-requests: read

network:
  allowed:
    - python
    - api.binance.com
    - data-api.binance.com
    - dataapi.binance.vision
    - stream.binance.com

engine:
  id: copilot
  model: gpt-5.3-codex

tools:
  github:

safe-outputs:
  create-pull-request:
    title-prefix: "[code-health-fix] "
    labels: [code-health, remediation, agent-proposed]
    protected-files: allowed
  noop:
    max: 1
    report-as-issue: false

steps:
  - name: Set up Python
    uses: actions/setup-python@v6
    with:
      python-version: '3.10'
      cache: pip

  - name: Prepare remediation tooling
    shell: bash
    run: |
      set +e
      {
        echo "# Code Health Remediation Tooling"
        echo
        echo "Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
        echo
        echo "## Setup"
      } > code-health-remediation-tooling.md

      python -m venv .venv >> code-health-remediation-tooling.md 2>&1
      source .venv/bin/activate >> code-health-remediation-tooling.md 2>&1
      python -m pip install --upgrade pip >> code-health-remediation-tooling.md 2>&1
      python -m pip install -r requirements.txt >> code-health-remediation-tooling.md 2>&1
      python -m pip install ruff pytest pytest-cov pip-audit >> code-health-remediation-tooling.md 2>&1

      {
        echo
        echo "## Tool paths"
        echo "python=$(command -v python || true)"
        echo "ruff=$(command -v ruff || true)"
        echo "pytest=$(command -v pytest || true)"
        echo "pip-audit=$(command -v pip-audit || true)"
      } >> code-health-remediation-tooling.md

  - name: Capture remediation issue input
    shell: bash
    run: |
      set -euo pipefail
      python - <<'PY'
      import json
      import os

      event_path = os.environ.get("GITHUB_EVENT_PATH", "")
      event_name = os.environ.get("GITHUB_EVENT_NAME", "")
      issue_number = ""

      if event_path and os.path.exists(event_path):
          with open(event_path, encoding="utf-8") as handle:
              event = json.load(handle)
          issue_number = str(
              event.get("inputs", {}).get("issue_number")
              or event.get("issue", {}).get("number")
              or ""
          )

      with open("code-health-remediation-input.md", "w", encoding="utf-8") as handle:
          handle.write("# Code Health Remediation Input\n\n")
          handle.write(f"- Event name: {event_name}\n")
          handle.write(f"- Issue number: {issue_number}\n")
      PY
---
# Code Health Remediation

You are the code-health remediation agent for Nexus Lite, a private FastAPI application with background workers, PostgreSQL plus pgvector, Redis, local embeddings, and an LLM gateway.

## Goal

Read the triggering Weekly Codebase Check-Up issue, resolve the concrete findings with meaningful code changes, verify them, and open a pull request.

Do not push directly to `main`. Do not perform unrelated cleanup. The maintainer has approved remediation of the findings reported by the code-health issue; do not require additional approval merely because a finding touches trading, scheduler, strategy, backtest, API, dependency, workflow, or documentation code. Use tests and small reviewable changes as the guardrail.

The weekly audit may create multiple bucketed issues in one run. Treat the triggering issue as your complete and exclusive remediation bucket. Do not combine separate code-health issues into one PR, and do not leave the triggering issue's primary findings for another run.

## Trigger Validation

1. Read `code-health-remediation-input.md`. If it contains a non-empty `Issue number`, use that exact issue and do not search for a newer issue.
2. Read the triggering issue from the GitHub event or from the captured issue number.
3. Continue only when all are true:
   - the issue has label `code-health`;
   - the title starts with `[code-health] Weekly Codebase Check-Up`;
   - the body contains `<!-- gh-aw-workflow-id: weekly-codebase-checkup -->`.
4. If the captured issue number is empty and the event does not provide an issue number, find the newest open issue matching those same criteria.
5. If no valid code-health issue is found, call `noop` with a short explanation and stop.

## Required Repository Context

Before editing, read:

- `code-health-remediation-input.md`
- `code-health-remediation-tooling.md`
- `AGENTS.md`
- `TODO.md`
- `requirements.txt`
- `docs/testing.md` if present
- `.github/workflows/code-health.md`
- the exact files named in the issue findings before modifying them

If the workspace is sparse-checked out, run:

```bash
git sparse-checkout disable || true
```

## Finding Triage Rules

Classify each actionable issue finding before editing:

- **Must fix:** concrete findings with named files/functions and deterministic evidence, including vulnerable pinned dependencies, ruff/format failures, high complexity in named runtime paths, focused type/test failures, and narrow security/tooling defects.
- **Best-effort fix:** findings that are real but may need a larger sequence of behavior-preserving extractions. For grouped refactor bucket issues, implement the listed refactor plan in one PR with tests instead of producing a dependency-only or single-function PR.
- **Noisy/report-only:** baseline-scale static-analysis debt, low-confidence security findings, test `assert` warnings, unused fixture placeholders, and broad dependency declarations without a specific runtime problem.

Implement **Must fix** findings. For **Best-effort fix** findings, make a targeted code improvement when a named file/function is provided and verification is possible. For **Noisy/report-only** findings, mention that they were intentionally left untouched.

Do not open a PR that only bumps a dependency when the triggering issue's bucket contains concrete code-quality findings in named files. In that case, the PR must include non-dependency code remediation for the named bucket or a clearly evidenced `missing_data`/`missing_tool` result explaining why remediation was impossible.

If the issue contains a `Scope Boundary` section, obey it strictly:

- Change files/functions/packages listed as "In scope".
- Do not change items listed as "Out of scope" unless they are required test fixtures or direct callers needed to keep the scoped change working.
- If the issue contains a `Refactor Plan`, remediate the functions listed there in this PR. Do not punt listed high-complexity functions to separate runs.

## Remediation Policy

- Keep changes as small as possible.
- Prefer behavior-preserving extraction and characterization tests for complex runtime functions.
- Prefer updating pinned versions over broad dependency reshuffles.
- Preserve existing code style and workflow patterns.
- Do not change `AGENTS.md` without updating the matching docs/specs files and TODO entries.
- Do not edit generated lock files except by running the appropriate generator/compile command.
- Never force-push, amend, reset hard, or merge.
- Use a branch named `agent/code-health-remediation-<issue-number>`.
- Use specific staging; never use `git add -A`.

## Dependency Findings

For vulnerable pinned dependencies:

1. Confirm the package and patched version from the issue body.
2. Update the relevant pinned requirement to the patched version or a newer compatible safe version.
3. If a lock/compiled/generated dependency file exists for that dependency, update it using the repository's normal tool.
4. Run the narrow verification first, then broaden if practical:
   - package installation or import check if available;
   - `pip-audit`;
   - affected tests if identifiable;
   - `pytest src/tests` when runtime dependency risk is non-trivial.

If package resolution fails, revert only your attempted dependency edit and call `missing_data` or `missing_tool` with exact failure evidence.

## Complexity Findings

For complexity findings in ingestion, document cleaning, chunking, embeddings, claim extraction, retrieval, synthesis, query answering, worker orchestration, scheduler, or API paths:

- Verify the named files/functions exist.
- Work through the issue's `Refactor Plan` function by function.
- Add or identify characterization tests that exercise the current behavior before editing when practical.
- Extract helpers, split validation/persistence/decision branches, or simplify duplicated conditionals without changing observable behavior.
- Prefer meaningful complexity reductions across the grouped bucket over shallow whitespace or comment churn.
- Do not change evidence linking, retrieval ranking, claim/brief semantics, worker side effects, or database schema unless the finding explicitly identifies that behavior as the bug.
- If no safe characterization path exists, call `missing_data` with exact evidence rather than creating an unrelated or dependency-only PR.

## Verification

Run the most relevant checks for the changes you made. Prefer:

```bash
source .venv/bin/activate
ruff check . --fix
ruff format .
pytest src/tests
pip-audit
```

If JavaScript files change, also run:

```bash
npx eslint --fix app/
```

If a command is unavailable or fails for an unrelated baseline reason, record the exact command and result in the PR body. Do not hide failed verification.

## Pull Request Requirements

If no edits are warranted, call `noop` and stop.

If you make edits:

1. Create or switch to `agent/code-health-remediation-<issue-number>`.
2. Commit only the relevant files with a concise message.
3. Create a pull request using `create_pull_request`.

The PR body must include:

- source issue number and URL;
- findings implemented;
- findings intentionally left untouched and why;
- exact files changed;
- verification commands and outcomes;
- residual risks.

Use this title format, without the safe-output prefix:

```text
Remediate code-health issue #<issue-number>
```
