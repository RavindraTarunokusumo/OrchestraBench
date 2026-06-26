import { createMockExecutor } from "@/lib/execution/mock-executor";
import type { SandboxExecutor } from "@/lib/execution/executor";

export function createConfiguredExecutor(): SandboxExecutor {
  return createMockExecutor({});
}
