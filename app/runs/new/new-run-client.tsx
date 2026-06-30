"use client";

import { useState } from "react";
import Link from "next/link";
import { useRunStream } from "@/components/orchestration/use-run-stream";
import { OrchestrationCanvas } from "@/components/orchestration/canvas";
import {
  defaultRunConfigFormValues,
  RunConfigForm,
  validateRunConfigForm,
  type RunConfigFormValues
} from "@/components/runs/run-config-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BenchmarkTask } from "@/lib/domain/types";
import { workflowLabels } from "@/lib/workflows/labels";
import { formatCostUsd, formatScore } from "@/lib/utils";

type NewRunClientProps = {
  task: BenchmarkTask;
  benchmarkSlug: string;
  benchmarkName: string;
};

export function NewRunClient({ task, benchmarkSlug, benchmarkName }: NewRunClientProps) {
  const [formValues, setFormValues] = useState<RunConfigFormValues>(defaultRunConfigFormValues);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { status, graph, nodeStates, totals, escalation, finalRunId, finalSummary, executionResult, error, start } =
    useRunStream();

  const isRunning = status === "running";
  const isTerminal = status === "complete" || status === "failed";

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const configResult = validateRunConfigForm(formValues);
    if (!configResult.ok) {
      setValidationError(configResult.error);
      return;
    }
    setValidationError(null);
    start({
      title: task.title,
      language: task.language,
      prompt: task.prompt,
      code: task.code,
      testCode: task.testCode,
      entryPoint: task.entryPoint,
      benchmarkTaskId: task.id,
      ...configResult.config
    });
  }

  function handleRunAgain() {
    setValidationError(null);
    const configResult = validateRunConfigForm(formValues);
    if (!configResult.ok) {
      setValidationError(configResult.error);
      return;
    }
    start({
      title: task.title,
      language: task.language,
      prompt: task.prompt,
      code: task.code,
      testCode: task.testCode,
      entryPoint: task.entryPoint,
      benchmarkTaskId: task.id,
      ...configResult.config
    });
  }

  const resolved = finalSummary?.resolved ?? executionResult?.resolved ?? false;
  const testsPassed = finalSummary?.testsPassed ?? executionResult?.testsPassed ?? 0;
  const testsTotal = finalSummary?.testsTotal ?? executionResult?.testsTotal ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/benchmarks/${benchmarkSlug}`} className="hover:text-foreground font-medium hover:underline">
          {benchmarkName}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{task.title}</span>
      </div>

      {status === "error" && error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Run failed to start</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Adjust the configuration below and submit again to retry.
          </CardContent>
        </Card>
      )}

      {(isRunning || isTerminal) && (
        <Card>
          <CardHeader>
            <CardTitle>Orchestration in progress</CardTitle>
            <CardDescription>Workflow: {workflowLabels[formValues.workflow]}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <OrchestrationCanvas
              graph={graph}
              nodeStates={nodeStates}
              totals={totals}
              escalation={escalation}
              status={status}
              mode="live"
              finalRunId={finalRunId}
            />

            {isTerminal && finalSummary && (
              <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={resolved ? "default" : "destructive"}>
                    {resolved ? "Resolved ✓" : "Unresolved ✗"}
                  </Badge>
                  <Badge variant="outline">
                    {testsPassed}/{testsTotal} tests passed
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryStat label="Status" value={finalSummary.status} />
                  <SummaryStat label="Tests" value={`${testsPassed}/${testsTotal}`} />
                  <SummaryStat label="Cost" value={formatCostUsd(finalSummary.costUsd)} />
                  <SummaryStat
                    label="Timing"
                    value={`${finalSummary.latencyMs.toLocaleString()}ms model · ${finalSummary.executionMs.toLocaleString()}ms exec`}
                  />
                  <SummaryStat label="Value score" value={formatScore(finalSummary.valueScore)} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Buggy code</h3>
                    <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                      {task.code}
                    </pre>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Candidate fix</h3>
                    <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                      {finalSummary.candidateCode || "(no code extracted yet)"}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {isTerminal && (
              <div className="flex flex-wrap gap-3">
                {finalRunId && (
                  <Button asChild>
                    <Link href={`/runs/${finalRunId}`}>View full report</Link>
                  </Button>
                )}
                <Button variant="outline" type="button" onClick={handleRunAgain}>
                  Run again
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/benchmarks/${benchmarkSlug}?task=${task.id}`}>Back to task</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
        <Card className={isRunning ? "opacity-60" : undefined}>
          <CardHeader>
            <CardTitle>{task.title}</CardTitle>
            <CardDescription>
              {task.language} · {task.source}
              {task.tags.length > 0 ? ` · ${task.tags.join(", ")}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">{task.prompt}</p>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Buggy code</h3>
              <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                {task.code}
              </pre>
            </div>
            {task.testCode ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Tests</h3>
                <pre className="bg-muted max-h-32 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                  {task.testCode}
                </pre>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={isRunning ? "opacity-60" : undefined}>
          <CardHeader>
            <CardTitle>Run configuration</CardTitle>
            <CardDescription>Pick a workflow, models, and optional limits for this task.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RunConfigForm
              values={formValues}
              onChange={setFormValues}
              disabled={isRunning}
              idPrefix="task-run"
            />

            {validationError && <p className="text-sm text-destructive">{validationError}</p>}

            <Button type="submit" disabled={isRunning}>
              {isRunning ? "Running…" : "Run task"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
