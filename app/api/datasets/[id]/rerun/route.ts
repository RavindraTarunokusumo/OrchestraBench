import { z } from "zod";
import { workflowKinds } from "@/lib/domain/types";
import type { WorkflowKind } from "@/lib/domain/types";
import { rerunDatasetTask } from "@/lib/store/file-store";

const rerunDatasetSchema = z.object({
  workflows: z.array(z.enum(workflowKinds)).min(1).optional().default([...workflowKinds]),
  costLimitUsd: z.number().positive().optional()
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RerunDatasetInput = {
  workflows: WorkflowKind[];
  costLimitUsd?: number;
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
    const runs = await rerunDatasetTask(id, parsed.data.workflows, parsed.data.costLimitUsd);
    return Response.json({ runs }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Dataset task not found.") {
      return jsonError(404, "Dataset task not found.");
    }

    throw error;
  }
}

export function parseDatasetRerunRequest(data: unknown): RerunDatasetInput {
  return rerunDatasetSchema.parse(data);
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
