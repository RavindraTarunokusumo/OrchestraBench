import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunResult } from "@/lib/domain/types";

const postRun = vi.fn().mockResolvedValue(undefined);
const patchRun = vi.fn().mockResolvedValue(undefined);
const end = vi.fn().mockResolvedValue(undefined);
const createChild = vi.fn().mockReturnValue({
  postRun,
  patchRun,
  end
});

vi.mock("langsmith", () => ({
  RunTree: vi.fn().mockImplementation((config: unknown) => ({
    config,
    postRun,
    patchRun,
    end,
    createChild
  }))
}));

describe("langsmith observability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    postRun.mockClear();
    patchRun.mockClear();
    end.mockClear();
    createChild.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("isTracingEnabled is false when tracing env vars are missing", async () => {
    const { isTracingEnabled } = await import("@/lib/observability/langsmith");
    expect(isTracingEnabled()).toBe(false);
  });

  it("isTracingEnabled is false when only LANGCHAIN_TRACING_V2 is set", async () => {
    vi.stubEnv("LANGCHAIN_TRACING_V2", "true");
    const { isTracingEnabled } = await import("@/lib/observability/langsmith");
    expect(isTracingEnabled()).toBe(false);
  });

  it("isTracingEnabled is true when tracing and API key are configured", async () => {
    vi.stubEnv("LANGCHAIN_TRACING_V2", "true");
    vi.stubEnv("LANGCHAIN_API_KEY", "test-key");
    const { isTracingEnabled } = await import("@/lib/observability/langsmith");
    expect(isTracingEnabled()).toBe(true);
  });

  it("traceWorkflowRun is a no-op passthrough when disabled", async () => {
    const { traceWorkflowRun } = await import("@/lib/observability/langsmith");
    const fn = vi.fn(async (parentRun: unknown): Promise<RunResult> => {
      expect(parentRun).toBeUndefined();
      return {
        id: "run_test",
        workflow: "single_cheap",
        status: "completed",
        title: "t",
        language: "python",
        prompt: "p",
        code: "c",
        providerLabel: "mock",
        finalAnswer: "answer",
        candidateCode: "code",
        execution: {
          resolved: true,
          testsPassed: 1,
          testsTotal: 1,
          exitCode: 0,
          timedOut: false,
          stdout: "",
          stderr: "",
          durationMs: 1,
          backend: "mock"
        },
        calls: [],
        evaluation: {
          resolved: true,
          testsPassed: 1,
          testsTotal: 1,
          valueScore: 1
        },
        costUsd: 0,
        latencyMs: 1,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };
    });

    const result = await traceWorkflowRun({ workflow: "single_cheap" }, fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(result.id).toBe("run_test");
    expect(postRun).not.toHaveBeenCalled();
  });

  it("traceModelCall is a no-op passthrough when disabled", async () => {
    const { traceModelCall } = await import("@/lib/observability/langsmith");
    const fn = vi.fn().mockResolvedValue({
      text: "ok",
      usage: { inputTokens: 1, outputTokens: 1 },
      estimatedCostUsd: 0,
      latencyMs: 1,
      provider: "mock",
      model: "mock-model"
    });

    const response = await traceModelCall(
      undefined,
      { role: "cheap_reviewer", model: "mock-model" },
      fn
    );

    expect(fn).toHaveBeenCalledOnce();
    expect(response.text).toBe("ok");
    expect(createChild).not.toHaveBeenCalled();
  });

  it("traceBenchmarkBatch is a no-op passthrough when disabled", async () => {
    const { traceBenchmarkBatch } = await import("@/lib/observability/langsmith");
    const fn = vi.fn(async (parentRun: unknown) => {
      expect(parentRun).toBeUndefined();
      return "done";
    });

    const result = await traceBenchmarkBatch(
      "batch_1",
      { benchmarkSlug: "quixbugs", taskTotal: 3, workflow: "cheap_first" },
      fn
    );

    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe("done");
    expect(postRun).not.toHaveBeenCalled();
  });

  it("creates workflow and model spans when tracing is enabled", async () => {
    vi.stubEnv("LANGCHAIN_TRACING_V2", "true");
    vi.stubEnv("LANGCHAIN_API_KEY", "test-key");
    vi.stubEnv("LANGCHAIN_PROJECT", "test-project");

    const { RunTree } = await import("langsmith");
    const { traceWorkflowRun, traceModelCall } = await import("@/lib/observability/langsmith");

    const modelFn = vi.fn().mockResolvedValue({
      text: "model-output",
      usage: { inputTokens: 4, outputTokens: 6 },
      estimatedCostUsd: 0.001,
      latencyMs: 12,
      provider: "mock",
      model: "cheap-model"
    });

    const workflowResult: RunResult = {
      id: "run_enabled",
      workflow: "single_cheap",
      status: "completed",
      title: "t",
      language: "python",
      prompt: "p",
      code: "c",
      providerLabel: "mock",
      finalAnswer: "answer",
      candidateCode: "code",
      execution: {
        resolved: true,
        testsPassed: 2,
        testsTotal: 2,
        exitCode: 0,
        timedOut: false,
        stdout: "",
        stderr: "",
        durationMs: 1,
        backend: "mock"
      },
      calls: [],
      evaluation: {
        resolved: true,
        testsPassed: 2,
        testsTotal: 2,
        valueScore: 1
      },
      costUsd: 0.001,
      latencyMs: 12,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      benchmarkTaskId: "task_1"
    };

    const result = await traceWorkflowRun(
      { workflow: "single_cheap", benchmarkTaskId: "task_1" },
      async (parentRun) => {
        expect(parentRun).toBeDefined();
        await traceModelCall(
          parentRun,
          { role: "cheap_reviewer", model: "cheap-model", nodeId: "cheap_reviewer" },
          modelFn
        );
        return workflowResult;
      }
    );

    expect(RunTree).toHaveBeenCalled();
    expect(postRun).toHaveBeenCalled();
    expect(createChild).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "llm.cheap_reviewer",
        run_type: "llm",
        project_name: "test-project"
      })
    );
    expect(modelFn).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalled();
    expect(patchRun).toHaveBeenCalled();
    expect(result.id).toBe("run_enabled");
  });
});
