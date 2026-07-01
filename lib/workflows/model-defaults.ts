const DEFAULT_CHEAP_MODEL = "cohere/north-mini-code:free";

export function getDefaultCheapModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_CHEAP_MODEL;
}

export function getDefaultStrongModel(): string {
  return process.env.OPENROUTER_STRONG_MODEL?.trim() || getDefaultCheapModel();
}
