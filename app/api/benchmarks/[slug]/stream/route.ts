import { benchmarkRunSchema, formatZodErrors } from "@/lib/api/contracts";
import { getBenchmark } from "@/lib/benchmarks/catalog";
import { runBenchmarkBatch } from "@/lib/benchmarks/run-batch";
import type { BatchEvent } from "@/lib/benchmarks/batch-events";
import { createConfiguredExecutor } from "@/lib/execution/provider";
import { createConfiguredProvider } from "@/lib/providers/provider";
import { listDatasets, listRuns } from "@/lib/store/file-store";
import { encodeSseEvent } from "@/lib/workflows/sse";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;

  const tasks = await listDatasets();
  const runs = await listRuns();
  const benchmark = getBenchmark(slug, tasks, runs);
  if (!benchmark) {
    return Response.json({ error: "Benchmark not found." }, { status: 404 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(400, body.error);
  }

  const parsed = benchmarkRunSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "Invalid benchmark run request.", formatZodErrors(parsed.error));
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: BatchEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        } catch {
          // Client disconnected; workflow still runs to completion and persists server-side.
        }
      };

      try {
        const provider = createConfiguredProvider();
        const executor = createConfiguredExecutor();
        await runBenchmarkBatch(slug, parsed.data, { provider, executor, onEvent: send });
      } catch (error) {
        send({
          type: "run-error",
          message: error instanceof Error ? error.message : "Unexpected benchmark batch failure."
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
