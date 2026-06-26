const FENCE = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;

/** Pull the candidate code from a model answer: largest fenced block, else the trimmed answer. */
export function extractCode(answer: string): string {
  const blocks: string[] = [];
  for (const match of answer.matchAll(FENCE)) {
    blocks.push(match[1].replace(/\n$/, ""));
  }
  if (blocks.length > 0) {
    return blocks.reduce((best, block) => (block.length > best.length ? block : best)).trim();
  }
  return answer.trim();
}
