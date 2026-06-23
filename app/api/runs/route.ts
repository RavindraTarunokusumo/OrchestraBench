import { createRunSchema, formatZodErrors } from "@/lib/api/contracts";
import { createRun, listRuns } from "@/lib/store/file-store";

export async function GET() {
  const runs = await listRuns();
  return Response.json({ runs });
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(400, body.error);
  }

  const parsed = createRunSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "Invalid run request.", formatZodErrors(parsed.error));
  }

  try {
    const run = await createRun(parsed.data);
    return Response.json({ run }, { status: 201 });
  } catch (error) {
    return jsonError(502, error instanceof Error ? error.message : "Run execution failed.");
  }
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
