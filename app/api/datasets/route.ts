import { createDatasetSchema, formatZodErrors } from "@/lib/api/contracts";
import { createDatasetTask, listDatasets } from "@/lib/store/file-store";

export async function GET() {
  const datasets = await listDatasets();
  return Response.json({ datasets });
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(400, body.error);
  }

  const parsed = createDatasetSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "Invalid dataset request.", formatZodErrors(parsed.error));
  }

  const dataset = await createDatasetTask(parsed.data);
  return Response.json({ dataset }, { status: 201 });
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
