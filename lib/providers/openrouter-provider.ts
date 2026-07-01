import type { ModelProvider, ModelRequest, ModelResponse } from "@/lib/providers/types";

const DEFAULT_OPENROUTER_MODEL = "cohere/north-mini-code:free";

export function createOpenRouterProvider(): ModelProvider {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const defaultModel = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;

  return {
    label: apiKey ? "OpenRouter" : "OpenRouter unavailable",
    async complete(request: ModelRequest): Promise<ModelResponse> {
      if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not configured.");
      }

      const started = Date.now();
      const model = request.model || defaultModel;
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "OrchestraBench"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a concise code review agent. Return specific bug findings with severity, evidence, and fixes."
            },
            {
              role: "user",
              content: request.prompt
            }
          ],
          temperature: request.temperature ?? 0.2,
          ...(request.maxOutputTokens !== undefined ? { max_tokens: request.maxOutputTokens } : {})
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter request failed with ${response.status}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content?.trim() || "No response content returned.";
      const inputTokens = data.usage?.prompt_tokens ?? estimateTokens(request.prompt);
      const outputTokens = data.usage?.completion_tokens ?? estimateTokens(text);

      return {
        text,
        usage: {
          inputTokens,
          outputTokens
        },
        estimatedCostUsd: model.endsWith(":free")
          ? 0
          : Number((((inputTokens + outputTokens) / 1000) * 0.001).toFixed(6)),
        latencyMs: Date.now() - started,
        provider: "openrouter",
        model
      };
    }
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export { DEFAULT_OPENROUTER_MODEL };
