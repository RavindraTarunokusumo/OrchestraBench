import { formatZodErrors, rerunDatasetSchema } from "@/lib/api/contracts";
import { rerunDatasetTask } from "@/lib/store/file-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(400, body.error);
  }

  const parsed = rerunDatasetSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "Invalid rerun request.", formatZodErrors(parsed.error));
  }

  try {
    const result = await rerunDatasetTask(id, parsed.data.workflows, parsed.data.costLimitUsd);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Dataset task not found.") {
      return jsonError(404, "Dataset task not found.");
    }

    throw error;
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
