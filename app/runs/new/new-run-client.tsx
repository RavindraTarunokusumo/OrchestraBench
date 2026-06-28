"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRunStream } from "@/components/orchestration/use-run-stream";
import { OrchestrationCanvas } from "@/components/orchestration/canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";
import { extractCode } from "@/lib/workflows/extract-code";
import { workflowLabels } from "@/lib/workflows/labels";
import { formatCostUsd, formatScore } from "@/lib/utils";

const DEFAULTS = {
  title: "gcd repair",
  language: "python",
  prompt: "Fix the bug in this function so all tests pass. Return only the corrected code in a single code block.",
  code: "def gcd(a, b):\n    if b == 0:\n        return a\n    else:\n        return gcd(a % b, b)",
  testCode: "assert gcd(4, 2) == 2\nassert gcd(35, 21) == 7",
  workflow: "cheap_first" as WorkflowKind,
  costLimitUsd: ""
};

export function NewRunClient() {
  const [title, setTitle] = useState(DEFAULTS.title);
  const [language, setLanguage] = useState(DEFAULTS.language);
  const [prompt, setPrompt] = useState(DEFAULTS.prompt);
  const [code, setCode] = useState(DEFAULTS.code);
  const [testCode, setTestCode] = useState(DEFAULTS.testCode);
  const [workflow, setWorkflow] = useState<WorkflowKind>(DEFAULTS.workflow);
  const [costLimitUsd, setCostLimitUsd] = useState(DEFAULTS.costLimitUsd);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { status, graph, nodeStates, totals, escalation, finalRunId, finalSummary, executionResult, error, start } =
    useRunStream();

  const isRunning = status === "running";
  const isTerminal = status === "complete" || status === "failed";

  const candidateCode = useMemo(() => {
    const previews = Object.values(nodeStates)
      .map((node) => node.responsePreview ?? "")
      .filter((preview) => preview.length > 0);
    if (previews.length === 0) return "";
    const longest = previews.reduce((best, preview) => (preview.length > best.length ? preview : best));
    return extractCode(longest);
  }, [nodeStates]);

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!title.trim() || !language.trim() || !prompt.trim() || !code.trim()) {
      setValidationError("Title, language, prompt, and code are all required.");
      return;
    }
    if (!testCode.trim()) {
      setValidationError("Test code is required for ad-hoc runs.");
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
      testCode: testCode.trim(),
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
      testCode: DEFAULTS.testCode,
      workflow: DEFAULTS.workflow
    });
  }

  const resolved = finalSummary?.resolved ?? executionResult?.resolved ?? false;
  const testsPassed = finalSummary?.testsPassed ?? executionResult?.testsPassed ?? 0;
  const testsTotal = finalSummary?.testsTotal ?? executionResult?.testsTotal ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {status === "error" && error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Run failed to start</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Adjust the form below and submit again to retry.
          </CardContent>
        </Card>
      )}

      {(isRunning || isTerminal) && (
        <Card>
          <CardHeader>
            <CardTitle>Orchestration in progress</CardTitle>
            <CardDescription>Workflow: {workflowLabels[workflow]}</CardDescription>
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
                      {code}
                    </pre>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Candidate fix</h3>
                    <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                      {candidateCode || "(no code extracted yet)"}
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
            <CardDescription>Provide the buggy code and repair instructions.</CardDescription>
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
              <Label htmlFor="prompt">Repair instructions</Label>
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
              <Label htmlFor="code">Buggy code</Label>
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="testCode">Test code</Label>
              <Textarea
                id="testCode"
                value={testCode}
                disabled={isRunning}
                onChange={(changeEvent) => setTestCode(changeEvent.target.value)}
                rows={4}
                className="font-mono"
                placeholder="assert gcd(4, 2) == 2"
                required
              />
              <p className="text-muted-foreground text-xs">
                Required for ad-hoc runs. Benchmark tasks supply test code server-side when selected.
              </p>
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
