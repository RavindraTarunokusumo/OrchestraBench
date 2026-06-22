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

const runSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  code: z.string().trim().min(1),
  workflow: workflowSchema,
  costLimitUsd: z.coerce.number().positive().optional()
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
  const parsed = runSchema.parse(Object.fromEntries(formData));
  const run = await createRun(parsed);
  redirect(`/runs/${run.id}`);
}

export async function feedbackAction(formData: FormData): Promise<void> {
  const runId = z.string().min(1).parse(formData.get("runId"));
  const userRating = z.coerce.number().min(1).max(5).optional().parse(formData.get("userRating"));
  const notes = z.string().optional().parse(formData.get("notes"));
  await updateRunEvaluation(runId, { userRating, notes });
  redirect(`/runs/${runId}`);
}

export async function createDatasetAction(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const parsed = datasetSchema.parse(raw);
  const task = await createDatasetTask({
    ...parsed,
    tags: parsed.tags
      ? parsed.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : []
  });
  redirect(`/datasets/${task.id}`);
}

export async function rerunDatasetAction(formData: FormData): Promise<void> {
  const taskId = z.string().min(1).parse(formData.get("taskId"));
  const workflows = formData
    .getAll("workflows")
    .map(String)
    .filter((workflow): workflow is WorkflowKind => workflowKinds.includes(workflow as WorkflowKind));
  const selectedWorkflows = workflows.length > 0 ? workflows : [...workflowKinds];
  const costLimitRaw = formData.get("costLimitUsd");
  const costLimitUsd = costLimitRaw ? z.coerce.number().positive().parse(costLimitRaw) : undefined;
  const runs = await rerunDatasetTask(taskId, selectedWorkflows, costLimitUsd);
  redirect(runs.length === 1 ? `/runs/${runs[0].id}` : "/dashboard");
}
