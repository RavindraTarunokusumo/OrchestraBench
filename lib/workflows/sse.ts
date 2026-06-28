import type { WorkflowEvent } from "@/lib/workflows/events";

const SSE_DATA_PREFIX = "data: ";
const SSE_DELIMITER = "\n\n";

export function encodeSseEvent(event: WorkflowEvent): string {
  return `${SSE_DATA_PREFIX}${JSON.stringify(event)}${SSE_DELIMITER}`;
}

export type ParseSseChunkResult = { events: WorkflowEvent[]; rest: string };

/**
 * Splits a buffered SSE chunk on the "\n\n" event delimiter, strips the leading
 * "data: " prefix from each complete event, and JSON.parses it. Any trailing
 * partial event (no terminating "\n\n" yet) is returned as `rest` for the caller
 * to prepend to the next chunk.
 */
export function parseSseChunk(buffer: string): ParseSseChunkResult {
  const parts = buffer.split(SSE_DELIMITER);
  const rest = parts.pop() ?? "";
  const events: WorkflowEvent[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const withoutPrefix = trimmed.startsWith(SSE_DATA_PREFIX) ? trimmed.slice(SSE_DATA_PREFIX.length) : trimmed;
    events.push(JSON.parse(withoutPrefix) as WorkflowEvent);
  }
  return { events, rest };
}
