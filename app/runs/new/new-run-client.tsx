"use client";

import { useState } from "react";
import Link from "next/link";
import { useRunStream } from "@/components/orchestration/use-run-stream";
import { OrchestrationCanvas } from "@/components/orchestration/canvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";

const workflowLabels: Record<WorkflowKind, string> = {
  single_cheap: "Single Cheap Model",
  single_strong: "Single Strong Model",
  panel_judge: "Panel + Judge",
  cheap_first: "Cheap-First Escalation",
  planner_worker_verifier: "Planner → Worker → Verifier"
};

const DEFAULTS = {
  title: "Review auth helper",
  language: "TypeScript",
  prompt: "Find correctness, security, and edge-case bugs. Return concrete findings with severity and fixes.",
  code: "function canDelete(user?: { role: string }) {\n  return user!.role === 'admin';\n}",
  workflow: "cheap_first" as WorkflowKind,
  costLimitUsd: ""
};

export function NewRunClient() {
  const [title, setTitle] = useState(DEFAULTS.title);
  const [language, setLanguage] = useState(DEFAULTS.language);
  const [prompt, setPrompt] = useState(DEFAULTS.prompt);
  const [code, setCode] = useState(DEFAULTS.code);
  const [workflow, setWorkflow] = useState<WorkflowKind>(DEFAULTS.workflow);
  const [costLimitUsd, setCostLimitUsd] = useState(DEFAULTS.costLimitUsd);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { status, graph, nodeStates, totals, escalation, finalRunId, finalSummary, error, start } = useRunStream();

  const isRunning = status === "running";
  const isTerminal = status === "complete" || status === "failed";

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!title.trim() || !language.trim() || !prompt.trim() || !code.trim()) {
      setValidationError("Title, language, prompt, and code are all required.");
      return;
    }
    const parsedCostLimit = costLimitUsd.trim() === "" ? undefined : Number(costLimitUsd);
    if (parsedCostLimit !== undefined && (!Number.isFinite(parsedCostLimit) || parsedCostLimit <= 0)) {
      setValidationError("Cost limit must be a positive number.");
      return;
    }
    setValidationError(null);
    start({
      title: title.trim(),
      language: language.trim(),
      prompt: prompt.trim(),
      code: code.trim(),
      workflow,
      costLimitUsd: parsedCostLimit
    });
  }

  function handleRunAnother() {
    setValidationError(null);
    start({
      title: DEFAULTS.title,
      language: DEFAULTS.language,
      prompt: DEFAULTS.prompt,
      code: DEFAULTS.code,
      workflow: DEFAULTS.workflow
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {status === "error" && error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Run failed to start</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setValidationError(null)} type="button">
              Dismiss and retry below
            </Button>
          </CardContent>
        </Card>
      )}

      {(isRunning || isTerminal) && (
        <Card>
          <CardHeader>
            <CardTitle>Orchestration in progress</CardTitle>
            <CardDescription>
              Workflow: {workflowLabels[workflow]}
            </CardDescription>
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
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-4">
                <SummaryStat label="Status" value={finalSummary.status} />
                <SummaryStat label="Quality score" value={finalSummary.qualityScore.toFixed(2)} />
                <SummaryStat label="Value score" value={finalSummary.valueScore.toFixed(2)} />
                <SummaryStat label="Findings" value={String(finalSummary.findingsCount)} />
                <SummaryStat label="Cost" value={`$${finalSummary.costUsd.toFixed(4)}`} />
                <SummaryStat label="Latency" value={`${finalSummary.latencyMs.toLocaleString()}ms`} />
              </div>
            )}

            {isTerminal && (
              <div className="flex flex-wrap gap-3">
                {finalRunId && (
                  <Button asChild>
                    <Link href={`/runs/${finalRunId}`}>View full report</Link>
                  </Button>
                )}
                <Button variant="outline" type="button" onClick={handleRunAnother}>
                  Run another
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
        <Card className={isRunning ? "opacity-60" : undefined}>
          <CardHeader>
            <CardTitle>Task details</CardTitle>
            <CardDescription>What should the orchestration review?</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Task title</Label>
              <Input
                id="title"
                value={title}
                disabled={isRunning}
                onChange={(changeEvent) => setTitle(changeEvent.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt">Review instructions</Label>
              <Textarea
                id="prompt"
                value={prompt}
                disabled={isRunning}
                onChange={(changeEvent) => setPrompt(changeEvent.target.value)}
                rows={4}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Code or context</Label>
              <Textarea
                id="code"
                value={code}
                disabled={isRunning}
                onChange={(changeEvent) => setCode(changeEvent.target.value)}
                rows={8}
                className="font-mono"
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card className={isRunning ? "opacity-60" : undefined}>
          <CardHeader>
            <CardTitle>Run configuration</CardTitle>
            <CardDescription>Pick a workflow and optional cost limit.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={language}
                disabled={isRunning}
                onChange={(changeEvent) => setLanguage(changeEvent.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="workflow">Workflow</Label>
              <Select
                value={workflow}
                disabled={isRunning}
                onValueChange={(value) => setWorkflow(value as WorkflowKind)}
              >
                <SelectTrigger id="workflow" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workflowKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {workflowLabels[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="costLimitUsd">Cost limit USD (optional)</Label>
              <Input
                id="costLimitUsd"
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="0.02"
                value={costLimitUsd}
                disabled={isRunning}
                onChange={(changeEvent) => setCostLimitUsd(changeEvent.target.value)}
              />
            </div>

            {validationError && <p className="text-sm text-destructive">{validationError}</p>}

            <Button type="submit" disabled={isRunning}>
              {isRunning ? "Running…" : "Run benchmark"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Without <code className="font-mono">OPENROUTER_API_KEY</code>, runs use the deterministic mock
              provider. With credentials, the default OpenRouter model is{" "}
              <code className="font-mono">cohere/north-mini-code:free</code>.
            </p>
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
