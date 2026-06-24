import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/runs/stream/route";
import type { WorkflowEvent } from "@/lib/workflows/events";

// These tests invoke the route's exported POST handler directly (unlike
// tests/stream-route.test.ts, which only re-implements SSE serialization).
// No OPENROUTER_API_KEY is set in the test environment, so createConfiguredProvider()
// resolves to the mock provider and no network calls are made.

const validBody = {
  title: "Review auth helper",
  language: "TypeScript",
  prompt: "Find bugs in this code.",
  code: "function isAllowed(user?: { role: string }) { return user!.role === 'admin' }",
  workflow: "single_cheap"
};

function parseSseEvents(text: string): WorkflowEvent[] {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)) as WorkflowEvent);
}

describe("POST /api/runs/stream", () => {
  it("streams run-init followed by a terminal run-final for a valid run request", async () => {
    const request = new Request("http://localhost/api/runs/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody)
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.body).not.toBeNull();

    const text = await response.text();
    const events = parseSseEvents(text);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("run-init");

    const terminalEvent = events.at(-1);
    expect(terminalEvent?.type).toBe("run-final");
    if (terminalEvent?.type === "run-final") {
      expect(terminalEvent.status).toBe("completed");
    }
  });

  it("returns 400 without opening a stream when the body is invalid", async () => {
    const request = new Request("http://localhost/api/runs/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, code: undefined })
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).not.toBe("text/event-stream");

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBeTruthy();
  });
});
