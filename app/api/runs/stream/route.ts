import { createRunSchema, formatZodErrors } from "@/lib/api/contracts";
import { createConfiguredProvider } from "@/lib/providers/provider";
import { saveRun } from "@/lib/store/file-store";
import { runWorkflow } from "@/lib/workflows/runner";
import type { WorkflowEvent } from "@/lib/workflows/events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(400, body.error);
  }

  const parsed = createRunSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "Invalid run request.", formatZodErrors(parsed.error));
  }

  const input = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: WorkflowEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected; the controller is closed. Stop emitting — the
          // workflow still runs to completion and persists server-side.
        }
      };

      try {
        const provider = createConfiguredProvider();
        const result = await runWorkflow({ input, provider, onEvent: send });
        const saved = await saveRun(result);
        send({
          type: "run-final",
          runId: saved.id,
          status: saved.status,
          costUsd: saved.costUsd,
          latencyMs: saved.latencyMs,
          findingsCount: saved.findings.length,
          qualityScore: saved.evaluation.qualityScore,
          valueScore: saved.evaluation.valueScore
        });
      } catch (error) {
        // runWorkflow catches in-workflow failures internally and resolves a
        // status:"failed" RunResult (surfaced below as run-final). This catch only
        // covers errors outside the workflow itself, e.g. createConfiguredProvider
        // throwing or saveRun/persistence failing.
        send({
          type: "run-error",
          message: error instanceof Error ? error.message : "Unexpected workflow failure."
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed (e.g. client disconnected mid-run).
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

async function readJsonBody(request: Request): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
}

function jsonError(status: number, error: string, details?: string[]) {
  return Response.json({ error, ...(details ? { details } : {}) }, { status });
}
