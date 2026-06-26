export const workflowKinds = [
  "single_cheap",
  "single_strong",
  "panel_judge",
  "cheap_first",
  "planner_worker_verifier"
] as const;

export type WorkflowKind = (typeof workflowKinds)[number];

export type RunStatus = "pending" | "running" | "completed" | "failed" | "partial";

export type Severity = "low" | "medium" | "high" | "critical";

export type ModelRole =
  | "cheap_reviewer"
  | "strong_reviewer"
  | "panelist"
  | "judge"
  | "verifier"
  | "planner"
  | "worker"
  | "finalizer";

export type KnownBug = {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  filePath?: string;
  line?: number;
};

export type ExecutionResult = {
  resolved: boolean;
  testsPassed: number;
  testsTotal: number;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  backend: "e2b" | "mock";
};

export type Evaluation = {
  resolved: boolean;
  testsPassed: number;
  testsTotal: number;
  valueScore: number;
  judgeConfidence?: number;
  userRating?: number;
  notes?: string;
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ModelCallTrace = {
  id: string;
  role: ModelRole;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  usage: ModelUsage;
  estimatedCostUsd: number;
  latencyMs: number;
  error?: string;
  /** Graph node this call was bound to at launch time; authoritative for static replay ordering. */
  nodeId?: string;
};

export type RunInput = {
  title: string;
  language: string;
  prompt: string;
  code: string;
  workflow: WorkflowKind;
  costLimitUsd?: number;
  benchmarkTaskId?: string;
  testCode?: string;
  entryPoint?: string;
};

export type RunResult = {
  id: string;
  workflow: WorkflowKind;
  status: RunStatus;
  title: string;
  language: string;
  prompt: string;
  code: string;
  providerLabel: string;
  finalAnswer: string;
  candidateCode: string;
  execution: ExecutionResult;
  calls: ModelCallTrace[];
  evaluation: Evaluation;
  costUsd: number;
  latencyMs: number;
  startedAt: string;
  completedAt: string;
  escalated?: boolean;
  escalationReason?: string;
  failureNotes?: string;
  benchmarkTaskId?: string;
  knownBugs?: KnownBug[];
};

export type BenchmarkTask = {
  id: string;
  title: string;
  language: string;
  prompt: string;
  code: string;
  testCode: string;
  referenceFix?: string;
  entryPoint?: string;
  source: "manual" | "quixbugs";
  knownBugs?: KnownBug[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
