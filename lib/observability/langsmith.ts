import { RunTree } from "langsmith";

import type { RunResult } from "@/lib/domain/types";
import type { ModelRequest, ModelResponse } from "@/lib/providers/types";

export type LangsmithParentRun = RunTree;

const DEFAULT_PROJECT = "orchestrabench";

export type WorkflowRunMetadata = {
  workflow: string;
  benchmarkTaskId?: string;
  benchmarkSlug?: string;
  batchId?: string;
  batchIndex?: number;
  runId?: string;
};

export type ModelCallMetadata = {
  role: string;
  model: string;
  nodeId?: string;
  request?: ModelRequest;
};

export type BenchmarkBatchMetadata = {
  benchmarkSlug: string;
  taskTotal?: number;
  workflow?: string;
};

let tracingWarningLogged = false;

export function isTracingEnabled(): boolean {
  return (
    process.env.LANGCHAIN_TRACING_V2 === "true" &&
    Boolean(process.env.LANGCHAIN_API_KEY?.trim())
  );
}

function getProjectName(): string {
  return process.env.LANGCHAIN_PROJECT?.trim() || DEFAULT_PROJECT;
}

function logTracingWarningOnce(message: string): void {
  if (!tracingWarningLogged) {
    tracingWarningLogged = true;
    console.warn(`[langsmith] ${message}`);
  }
}

function workflowInputs(metadata: WorkflowRunMetadata): Record<string, unknown> {
  return {
    workflow: metadata.workflow,
    benchmark_task_id: metadata.benchmarkTaskId,
    benchmark_slug: metadata.benchmarkSlug,
    batch_id: metadata.batchId,
    batch_index: metadata.batchIndex,
    run_id: metadata.runId
  };
}

function workflowOutputs(result: RunResult): Record<string, unknown> {
  return {
    run_id: result.id,
    workflow: result.workflow,
    benchmark_task_id: result.benchmarkTaskId,
    batch_id: result.batchId,
    batch_index: result.batchIndex,
    resolved: result.execution.resolved,
    tests_passed: result.execution.testsPassed,
    tests_total: result.execution.testsTotal,
    cost_usd: result.costUsd,
    status: result.status
  };
}

function modelInputs(metadata: ModelCallMetadata): Record<string, unknown> {
  return {
    model: metadata.model,
    role: metadata.role,
    node_id: metadata.nodeId,
    prompt: metadata.request?.prompt,
    max_output_tokens: metadata.request?.maxOutputTokens,
    temperature: metadata.request?.temperature
  };
}

function modelOutputs(response: ModelResponse, metadata: ModelCallMetadata): Record<string, unknown> {
  return {
    model: response.model || metadata.model,
    role: metadata.role,
    cost_usd: response.estimatedCostUsd,
    latency_ms: response.latencyMs,
    usage: response.usage,
    text: response.text
  };
}

function batchInputs(batchId: string, metadata: BenchmarkBatchMetadata): Record<string, unknown> {
  return {
    batch_id: batchId,
    benchmark_slug: metadata.benchmarkSlug,
    task_total: metadata.taskTotal,
    workflow: metadata.workflow
  };
}

async function safeEndRun(
  run: RunTree,
  args: { outputs?: Record<string, unknown>; error?: string }
): Promise<void> {
  try {
    if (args.error) {
      await run.end(undefined, args.error);
    } else {
      await run.end(args.outputs);
    }
    await run.patchRun();
  } catch (error) {
    logTracingWarningOnce(
      `Failed to finalize trace: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

async function createParentRun(
  name: string,
  inputs: Record<string, unknown>
): Promise<RunTree | undefined> {
  const parentRun = new RunTree({
    name,
    run_type: "chain",
    inputs,
    project_name: getProjectName()
  });

  try {
    await parentRun.postRun();
    return parentRun;
  } catch (error) {
    logTracingWarningOnce(
      `Failed to post trace: ${error instanceof Error ? error.message : "unknown error"}`
    );
    return undefined;
  }
}

export async function traceWorkflowRun(
  metadata: WorkflowRunMetadata,
  fn: (parentRun: RunTree | undefined) => Promise<RunResult>
): Promise<RunResult> {
  if (!isTracingEnabled()) {
    return fn(undefined);
  }

  const parentRun = await createParentRun("orchestrabench.workflow", workflowInputs(metadata));
  if (!parentRun) {
    return fn(undefined);
  }

  try {
    const result = await fn(parentRun);
    await safeEndRun(parentRun, { outputs: workflowOutputs(result) });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow failure.";
    await safeEndRun(parentRun, { error: message });
    throw error;
  }
}

export async function traceModelCall(
  parentRun: RunTree | undefined,
  metadata: ModelCallMetadata,
  fn: () => Promise<ModelResponse>
): Promise<ModelResponse> {
  if (!isTracingEnabled() || !parentRun) {
    return fn();
  }

  let childRun: RunTree | undefined;
  try {
    childRun = parentRun.createChild({
      name: `llm.${metadata.role}`,
      run_type: "llm",
      inputs: modelInputs(metadata),
      project_name: getProjectName()
    });
    await childRun.postRun();
  } catch (error) {
    logTracingWarningOnce(
      `Failed to post model trace: ${error instanceof Error ? error.message : "unknown error"}`
    );
    return fn();
  }

  try {
    const response = await fn();
    await safeEndRun(childRun, { outputs: modelOutputs(response, metadata) });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model failure.";
    await safeEndRun(childRun, { error: message });
    throw error;
  }
}

export async function traceBenchmarkBatch<T>(
  batchId: string,
  metadata: BenchmarkBatchMetadata,
  fn: (parentRun: RunTree | undefined) => Promise<T>
): Promise<T> {
  if (!isTracingEnabled()) {
    return fn(undefined);
  }

  const parentRun = await createParentRun(
    "orchestrabench.benchmark_batch",
    batchInputs(batchId, metadata)
  );
  if (!parentRun) {
    return fn(undefined);
  }

  try {
    const result = await fn(parentRun);
    await safeEndRun(parentRun, {
      outputs: {
        batch_id: batchId,
        benchmark_slug: metadata.benchmarkSlug,
        task_total: metadata.taskTotal,
        workflow: metadata.workflow
      }
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown batch failure.";
    await safeEndRun(parentRun, { error: message });
    throw error;
  }
}
