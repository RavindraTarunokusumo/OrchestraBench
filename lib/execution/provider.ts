import { createE2bExecutor } from "@/lib/execution/e2b";
import { createMockExecutor } from "@/lib/execution/mock-executor";
import type { SandboxExecutor } from "@/lib/execution/executor";

export function createConfiguredExecutor(): SandboxExecutor {
  if (process.env.E2B_API_KEY) {
    return createE2bExecutor();
  }
  return createMockExecutor({
    resolved: false,
    testsPassed: 0,
    testsTotal: 0,
    stderr: "No sandbox configured (set E2B_API_KEY)."
  });
}
