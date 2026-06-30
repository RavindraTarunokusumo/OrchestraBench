"use client";

import Link from "next/link";
import { useState } from "react";
import { useBenchmarkStream } from "@/components/benchmarks/use-benchmark-stream";
import {
  defaultRunConfigFormValues,
  RunConfigForm,
  validateRunConfigForm,
  type RunConfigFormValues
} from "@/components/runs/run-config-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { workflowLabels } from "@/lib/workflows/labels";
import type { WorkflowKind } from "@/lib/domain/types";

type BenchmarkRunClientProps = {
  slug: string;
  benchmarkName: string;
  runnableTaskCount: number;
  totalTaskCount: number;
};

export function BenchmarkRunClient({
  slug,
  benchmarkName,
  runnableTaskCount,
  totalTaskCount
}: BenchmarkRunClientProps) {
  const [formValues, setFormValues] = useState<RunConfigFormValues>(defaultRunConfigFormValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const { status, taskIndex, taskTotal, log, finalSummary, error, start, reset } = useBenchmarkStream();

  const isRunning = status === "running";
  const isTerminal = status === "complete" || status === "error";
  const progressPercent =
    taskTotal > 0 ? Math.min(100, Math.round((taskIndex / taskTotal) * 100)) : 0;

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (runnableTaskCount === 0) {
      setValidationError("No runnable tasks — tasks need test code.");
      return;
    }

    const result = validateRunConfigForm(formValues);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    setValidationError(null);
    setStarted(true);
    start(slug, result.config);
  }

  function handleRunAgain() {
    setValidationError(null);
    setStarted(false);
    reset();
  }

  const skippedCount = totalTaskCount - runnableTaskCount;

  return (
    <div className="flex flex-col gap-6">
      {!started ? (
        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Benchmark session</CardTitle>
              <CardDescription>
                Run all runnable tasks in {benchmarkName} with one workflow and shared model settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                <span className="font-medium">{runnableTaskCount}</span> runnable task
                {runnableTaskCount === 1 ? "" : "s"}
                {skippedCount > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {skippedCount} skipped (missing test code)
                  </span>
                ) : null}
              </p>
              <Button asChild variant="outline" type="button">
                <Link href={`/benchmarks/${slug}`}>Back to benchmark</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run configuration</CardTitle>
              <CardDescription>One workflow runs across every task in sequence.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <RunConfigForm values={formValues} onChange={setFormValues} idPrefix="benchmark-run" />
              {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}
              <Button type="submit" disabled={runnableTaskCount === 0}>
                Run entire benchmark
              </Button>
            </CardContent>
          </Card>
        </form>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {isRunning ? "Running benchmark…" : isTerminal && status === "complete" ? "Benchmark complete" : "Benchmark run"}
            </CardTitle>
            <CardDescription>
              {benchmarkName}
              {formValues.workflow ? ` · ${workflowLabels[formValues.workflow as WorkflowKind]}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {taskTotal > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {Math.min(taskIndex, taskTotal)} / {taskTotal} tasks
                  </span>
                </div>
                <Progress value={progressPercent} />
              </div>
            ) : null}

            <div
              className="bg-muted/30 max-h-80 overflow-y-auto rounded-lg border p-4 font-mono text-sm"
              aria-live="polite"
            >
              {log.length === 0 ? (
                <p className="text-muted-foreground">Waiting for benchmark events…</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {log.map((entry) => (
                    <li
                      key={entry.id}
                      className={
                        entry.tone === "success"
                          ? "text-green-600 dark:text-green-400"
                          : entry.tone === "error"
                            ? "text-destructive"
                            : undefined
                      }
                    >
                      {entry.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {status === "error" && error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}

            {finalSummary ? (
              <p className="text-sm">
                {finalSummary.completed} completed · {finalSummary.failed} failed ·{" "}
                {(finalSummary.aggregateResolvedRate * 100).toFixed(0)}% aggregate resolve rate
              </p>
            ) : null}

            {isTerminal ? (
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/dashboard">Back to dashboard</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/benchmarks/${slug}`}>Back to benchmark</Link>
                </Button>
                <Button variant="outline" type="button" onClick={handleRunAgain}>
                  Configure another run
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
