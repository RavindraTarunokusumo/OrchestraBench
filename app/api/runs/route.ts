import { z } from "zod";
import { workflowKinds } from "@/lib/domain/types";
import type { RunInput } from "@/lib/domain/types";
import { createRun, listRuns } from "@/lib/store/file-store";

const severitySchema = z.enum(["low", "medium", "high", "critical"]);
const workflowSchema = z.enum(workflowKinds);

const knownBugSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  severity: severitySchema,
  filePath: z.string().trim().min(1).optional(),
  line: z.number().int().positive().optional()
});

const createRunSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  code: z.string().trim().min(1),
  workflow: workflowSchema,
  costLimitUsd: z.number().positive().optional(),
  benchmarkTaskId: z.string().trim().min(1).optional(),
  knownBugs: z.array(knownBugSchema).optional()
});

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

  const run = await createRun(parsed.data);
  return Response.json({ run }, { status: 201 });
}

export function parseRunCreateRequest(data: unknown): RunInput {
  return createRunSchema.parse(data);
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
