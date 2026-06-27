import type { ExecutionResult } from "@/lib/domain/types";
import type { SandboxExecutor } from "@/lib/execution/executor";

const DEFAULT_RESULT: ExecutionResult = {
  resolved: false,
  testsPassed: 0,
  testsTotal: 0,
  exitCode: null,
  timedOut: false,
  stdout: "",
  stderr: "",
  durationMs: 0,
  backend: "mock"
};

export function createMockExecutor(script: Partial<ExecutionResult>): SandboxExecutor {
  return {
    run: async () => ({ ...DEFAULT_RESULT, ...script, backend: "mock" })
  };
}
