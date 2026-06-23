"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";
import {
  createDatasetTask,
  createRun,
  rerunDatasetTask,
  updateRunEvaluation
} from "@/lib/store/file-store";

const workflowSchema = z.enum(workflowKinds);
const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().positive().optional()
);
const optionalRating = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().min(1).max(5).optional()
);
const optionalTrimmedString = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.string().trim().optional()
);

const runSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  code: z.string().trim().min(1),
  workflow: workflowSchema,
  costLimitUsd: optionalPositiveNumber
});

const datasetSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  code: z.string().trim().min(1),
  knownBugTitle: z.string().trim().optional(),
  knownBugDescription: z.string().trim().optional(),
  knownBugSeverity: z.enum(["low", "medium", "high", "critical"]).optional(),
  tags: z.string().trim().optional()
});

export async function createRunAction(formData: FormData): Promise<void> {
  const parsed = runSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/runs/new?error=invalid");
  }
  const run = await createRun(parsed.data);
  redirect(`/runs/${run.id}`);
}

export async function feedbackAction(formData: FormData): Promise<void> {
  const runId = z.string().min(1).safeParse(formData.get("runId"));
  if (!runId.success) {
    redirect("/dashboard?error=invalid-feedback");
  }
  const userRating = optionalRating.parse(formData.get("userRating"));
  const notes = optionalTrimmedString.parse(formData.get("notes"));
  await updateRunEvaluation(runId.data, { userRating, notes });
  redirect(`/runs/${runId.data}`);
}

export async function createDatasetAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const parsed = datasetSchema.safeParse(raw);
  if (!parsed.success) {
    redirect("/datasets?error=invalid");
  }
  const task = await createDatasetTask({
    ...parsed.data,
    tags: parsed.data.tags
      ? parsed.data.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : []
  });
  redirect(`/datasets/${task.id}`);
}

export async function rerunDatasetAction(formData: FormData): Promise<void> {
  const taskId = z.string().min(1).safeParse(formData.get("taskId"));
  if (!taskId.success) {
    redirect("/datasets?error=invalid-rerun");
  }
  const workflows = formData
    .getAll("workflows")
    .map(String)
    .filter((workflow): workflow is WorkflowKind => workflowKinds.includes(workflow as WorkflowKind));
  const selectedWorkflows = workflows.length > 0 ? workflows : [...workflowKinds];
  const costLimitRaw = formData.get("costLimitUsd");
  const costLimitUsd = optionalPositiveNumber.parse(costLimitRaw);
  const result = await rerunDatasetTask(taskId.data, selectedWorkflows, costLimitUsd);
  redirect(result.runs.length === 1 ? `/runs/${result.runs[0].id}` : "/dashboard");
}
