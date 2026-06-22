import type { ModelProvider, ModelRequest, ModelResponse } from "@/lib/providers/types";

type MockProviderOptions = {
  verifierConfidence?: number;
};

export function createMockProvider(options: MockProviderOptions = {}): ModelProvider {
  return {
    label: "Mock provider",
    async complete(request: ModelRequest): Promise<ModelResponse> {
      const confidence = options.verifierConfidence ?? 0.82;
      const text = buildMockText(request, confidence);
      const inputTokens = estimateTokens(request.prompt);
      const outputTokens = estimateTokens(text);

      return {
        text,
        usage: {
          inputTokens,
          outputTokens
        },
        estimatedCostUsd: estimateCost(request.model, inputTokens, outputTokens),
        latencyMs: 25 + request.role.length * 3,
        provider: "mock",
        model: request.model
      };
    }
  };
}

function buildMockText(request: ModelRequest, verifierConfidence: number): string {
  if (request.role === "verifier") {
    return JSON.stringify({
      confidence: verifierConfidence,
      notes:
        verifierConfidence < 0.6
          ? "The review is thin and should escalate."
          : "The review is specific enough for the task."
    });
  }

  if (request.role === "judge") {
    return "Judge synthesis: panel consensus flags unchecked nullable access and recommends a guard before role access.";
  }

  if (request.role === "planner") {
    return "Plan: inspect input validation, nullable access, authorization logic, and edge cases.";
  }

  if (request.role === "finalizer") {
    return "Final report: likely bug found in unsafe user access; add a null guard and tests for missing users.";
  }

  return `${request.role} report: Found a likely null/undefined access bug and recommends defensive validation.`;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  if (model.endsWith(":free")) {
    return 0;
  }

  return Number((((inputTokens + outputTokens) / 1000) * 0.0005).toFixed(6));
}
