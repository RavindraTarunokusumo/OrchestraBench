import { createMockProvider } from "@/lib/providers/mock-provider";
import { createOpenRouterProvider } from "@/lib/providers/openrouter-provider";
import type { ModelProvider } from "@/lib/providers/types";

export function createConfiguredProvider(): ModelProvider {
  if (process.env.OPENROUTER_API_KEY) {
    return createOpenRouterProvider();
  }

  return createMockProvider();
}
