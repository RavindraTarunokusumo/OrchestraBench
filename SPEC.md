# OrchestraBench — Adaptive Multi-Model Orchestration Benchmarker

## Core Idea

OrchestraBench is a mini research/product project for testing whether adaptive multi-model orchestration can outperform single-model inference under real cost, latency, and quality constraints.

The system takes a task, runs it through different workflows, logs all model calls, evaluates output quality, and compares the value of each approach.

## MVP Domain

The first domain should be code review and bug finding.

This is better than open-ended research because evaluation is easier: the system can compare findings, false positives, missed bugs, known seeded bugs, cost, latency, and user feedback.

## Recommended Stack

* Frontend/app: Next.js App Router
* Language: TypeScript
* Runtime: Node.js LTS
* UI: React, Tailwind, shadcn/ui
* LLM provider: OpenRouter
* LLM SDK: Vercel AI SDK with OpenRouter provider, or direct OpenRouter SDK/fetch for more control
* Database: PostgreSQL
* ORM: Prisma for MVP speed
* Background workflows: Inngest
* Validation: Zod
* Observability/evals: internal logging first; Braintrust, LangSmith, or OpenTelemetry later
* Deployment: Vercel, managed Postgres, Inngest Cloud

## Main Workflows

### 1. Single Cheap Model

A low-cost model answers directly. This establishes the cheapest baseline.

### 2. Single Strong Model

A strong model answers directly. This establishes the quality baseline.

### 3. Panel + Judge

Three models answer independently. A judge model compares consensus, contradictions, weak claims, and missing points, then produces a final answer.

### 4. Cheap-First Escalation

A cheap model answers first. A verifier checks quality. If confidence is low, the system escalates to a stronger model. This should become the most practical value workflow.

### 5. Planner → Worker → Verifier

A planner decomposes the task, a worker performs checks, a verifier attacks the answer, and the finalizer produces the final report. This is the most agent-like MVP workflow.

## Core Architecture

```text
User submits task
  ↓
Run record created
  ↓
Inngest workflow starts
  ↓
Router selects workflow
  ↓
Agents/model calls execute
  ↓
Judge/evaluator scores result
  ↓
Database stores trace, cost, latency, and output
  ↓
Dashboard displays comparison
```

## Main Data to Log

Each run should record:

* task input
* selected workflow
* models called
* agent roles
* input tokens
* output tokens
* estimated cost
* latency
* final answer
* judge score
* human feedback
* failure notes

## Evaluation Metrics

Track:

* bugs found
* true positives
* false positives
* missed known bugs
* severity-weighted score
* cost
* latency
* number of model calls
* judge confidence
* user rating

Initial value formula:

```text
quality_score =
  (true_positives * 3)
  + (high_severity_true_positives * 2)
  - (false_positives * 1.5)
  - (missed_known_bugs * 2)

value_score = quality_score / max(cost_usd, 0.0001)
```

## Main Pages

### New Run Page

User submits code/task, selects language, workflow, and cost limit.

### Run Detail Page

Shows final answer, findings table, model-call trace, judge notes, cost, latency, and feedback controls.

### Comparison Dashboard

Compares workflows by quality, cost, latency, and value score.

### Dataset Page

Stores benchmark tasks and allows reruns across different workflows.

## MVP Milestones

### Milestone 1 — Baseline Runner

Build Next.js app, database schema, OpenRouter wrapper, single cheap workflow, single strong workflow, and run detail page.

### Milestone 2 — Panel + Judge

Add parallel model calls, judge schema, final synthesis, and trace display.

### Milestone 3 — Cheap Escalation

Add verifier, escalation logic, cost limits, and comparison view.

### Milestone 4 — Evaluation Dashboard

Add LLM-as-judge scoring, human feedback, and quality/value metrics.

### Milestone 5 — Dataset Mode

Save benchmark tasks, seed known-bug examples, rerun workflows, and export results.

## Success Criteria

The MVP succeeds if it can answer:

1. Does panel + judge find more real issues than a single strong model?
2. How much more does orchestration cost?
3. Does cheap-first escalation preserve quality while reducing cost?
4. Which roles are actually useful: reviewer, verifier, critic, or judge?
5. Which task types deserve orchestration?

## Build Rule

Multi-agent orchestration is only valuable when the measured improvement is worth the extra model calls.
