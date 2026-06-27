import type { ExecutionResult } from "@/lib/domain/types";

export type ExecutorArgs = {
  language: string;
  candidateCode: string;
  testCode: string;
  entryPoint?: string;
  timeoutMs: number;
};

export interface SandboxExecutor {
  run(args: ExecutorArgs): Promise<ExecutionResult>;
}
