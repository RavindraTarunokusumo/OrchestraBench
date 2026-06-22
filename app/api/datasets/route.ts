import { z } from "zod";
import { createDatasetTask, listDatasets } from "@/lib/store/file-store";

const createDatasetSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  code: z.string().trim().min(1),
  knownBugTitle: z.string().trim().min(1).optional(),
  knownBugDescription: z.string().trim().min(1).optional(),
  knownBugSeverity: z.enum(["low", "medium", "high", "critical"]).optional(),
  tags: z.array(z.string().trim().min(1)).optional().default([])
});

type CreateDatasetInput = Parameters<typeof createDatasetTask>[0];

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

export function parseDatasetCreateRequest(data: unknown): CreateDatasetInput {
  return createDatasetSchema.parse(data);
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

function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}
