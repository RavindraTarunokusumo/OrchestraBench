import { z } from "zod";
import { workflowKinds } from "@/lib/domain/types";
import type { RunInput, WorkflowKind } from "@/lib/domain/types";
import type { createDatasetTask } from "@/lib/store/file-store";

const severitySchema = z.enum(["low", "medium", "high", "critical"]);
const workflowSchema = z.enum(workflowKinds);
const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().positive().optional()
);

const knownBugSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  severity: severitySchema,
  filePath: z.string().trim().min(1).optional(),
  line: z.number().int().positive().optional()
});

export const createRunSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  code: z.string().trim().min(1),
  workflow: workflowSchema,
  costLimitUsd: optionalPositiveNumber,
  benchmarkTaskId: z.string().trim().min(1).optional(),
  knownBugs: z.array(knownBugSchema).optional()
});

export const createDatasetSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  code: z.string().trim().min(1),
  knownBugTitle: z.string().trim().min(1).optional(),
  knownBugDescription: z.string().trim().min(1).optional(),
  knownBugSeverity: severitySchema.optional(),
  tags: z.array(z.string().trim().min(1)).optional().default([])
});

export const rerunDatasetSchema = z.object({
  workflows: z.array(workflowSchema).min(1).optional().default([...workflowKinds]),
  costLimitUsd: optionalPositiveNumber
});

type CreateDatasetInput = Parameters<typeof createDatasetTask>[0];

export type RerunDatasetInput = {
  workflows: WorkflowKind[];
  costLimitUsd?: number;
};

export function parseRunCreateRequest(data: unknown): RunInput {
  return createRunSchema.parse(data);
}

export function parseDatasetCreateRequest(data: unknown): CreateDatasetInput {
  return createDatasetSchema.parse(data);
}

export function parseDatasetRerunRequest(data: unknown): RerunDatasetInput {
  return rerunDatasetSchema.parse(data);
}

export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}
