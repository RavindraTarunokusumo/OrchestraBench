import { describe, expect, it } from "vitest";
import type { WorkflowEvent } from "@/lib/workflows/events";
import { encodeSseEvent, parseSseChunk } from "@/lib/workflows/sse";

describe("encodeSseEvent", () => {
  it("produces data: <json>\\n\\n framing", () => {
    const event: WorkflowEvent = { type: "escalation", escalated: false, reason: "ok" };
    expect(encodeSseEvent(event)).toBe(`data: ${JSON.stringify(event)}\n\n`);
  });
});

describe("SSE round-trip", () => {
  it("encodes two events, concatenates, and parses both with empty rest", () => {
    const event1: WorkflowEvent = {
      type: "step-start",
      stepId: "step_1",
      nodeId: "a",
      role: "cheap_reviewer",
      model: "m"
    };
    const event2: WorkflowEvent = { type: "escalation", escalated: true, reason: "low confidence" };

    const buffer = encodeSseEvent(event1) + encodeSseEvent(event2);
    const { events, rest } = parseSseChunk(buffer);

    expect(events).toEqual([event1, event2]);
    expect(rest).toBe("");
  });
});
