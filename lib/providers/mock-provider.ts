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

const BUGGY_CODE_MARKER = "Buggy code:";
const FENCED_BLOCK = /```(?:[a-zA-Z0-9_-]+)?[\n ]([\s\S]*?)```/;

export function extractMockCandidate(prompt: string): string {
  const lastMarker = prompt.lastIndexOf(BUGGY_CODE_MARKER);
  if (lastMarker !== -1) {
    return prompt.slice(lastMarker + BUGGY_CODE_MARKER.length).trim();
  }

  const fenced = FENCED_BLOCK.exec(prompt);
  if (fenced) {
    return fenced[1].replace(/\n$/, "").trim();
  }

  return "# mock candidate\npass";
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

  const candidate = extractMockCandidate(request.prompt);
  return `\`\`\`python\n${candidate}\n\`\`\``;
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
