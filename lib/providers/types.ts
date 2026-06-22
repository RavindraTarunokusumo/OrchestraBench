import type { ModelCallTrace, ModelRole, ModelUsage } from "@/lib/domain/types";

export type ModelRequest = {
  role: ModelRole;
  model: string;
  prompt: string;
  temperature?: number;
};

export type ModelResponse = {
  text: string;
  usage: ModelUsage;
  estimatedCostUsd: number;
  latencyMs: number;
  provider: string;
  model: string;
};

export type ModelProvider = {
  label: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
};

export function toCallTrace(
  request: ModelRequest,
  response: ModelResponse,
  id: string
): ModelCallTrace {
  return {
    id,
    role: request.role,
    provider: response.provider,
    model: response.model,
    prompt: request.prompt,
    response: response.text,
    usage: response.usage,
    estimatedCostUsd: response.estimatedCostUsd,
    latencyMs: response.latencyMs
  };
}
