import Link from "next/link";
import { notFound } from "next/navigation";
import { feedbackAction } from "@/app/actions";
import { OrchestrationCanvas } from "@/components/orchestration/canvas";
import { deriveNodeStatesFromCalls } from "@/components/orchestration/derive-node-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getRun } from "@/lib/store/file-store";
import { formatCostUsd, formatScore } from "@/lib/utils";
import { checkBudget } from "@/lib/workflows/budgets";
import { buildWorkflowGraph } from "@/lib/workflows/graph";
import { workflowLabel } from "@/lib/workflows/labels";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) {
    notFound();
  }

  const graph = buildWorkflowGraph(run.workflow);
  const nodeStates = deriveNodeStatesFromCalls(graph, run);
  const budget = checkBudget(run.workflow, run.costUsd, run.latencyMs);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{run.title}</h1>
          <p className="text-muted-foreground">
            {workflowLabel(run.workflow)} · {run.providerLabel} · {run.status}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Compare workflows</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric
          label="Resolved"
          value={run.execution.resolved ? "Yes" : "No"}
        />
        <Metric label="Tests" value={`${run.execution.testsPassed}/${run.execution.testsTotal}`} />
        <Metric label="Value" value={formatScore(run.evaluation.valueScore)} />
        <Metric label="Cost" value={formatCostUsd(run.costUsd)} />
        <Metric
          label="Budget"
          value={
            budget.withinBudget
              ? "Within"
              : `Over (${[!budget.withinCost && "cost", !budget.withinLatency && "latency"]
                  .filter(Boolean)
                  .join(" + ")})`
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orchestration replay</CardTitle>
          <CardDescription>Static replay of the saved model-call trace for this run.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrchestrationCanvas graph={graph} nodeStates={nodeStates} status={mapRunStatus(run.status)} mode="static" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={run.execution.resolved ? "default" : "destructive"}>
                {run.execution.resolved ? "Resolved" : "Unresolved"}
              </Badge>
              <Badge variant="outline">
                {run.execution.testsPassed}/{run.execution.testsTotal} tests passed
              </Badge>
              {run.escalated && <Badge variant="secondary">Escalated</Badge>}
            </div>
            {run.escalationReason && <CardDescription>{run.escalationReason}</CardDescription>}
            <CardTitle>Execution result</CardTitle>
            <CardDescription>
              Sandbox backend: {run.execution.backend} · {run.execution.durationMs} ms
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 text-sm font-medium">Candidate fix</h3>
              <pre className="bg-muted overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                {run.candidateCode || "(no code extracted)"}
              </pre>
            </div>

            {run.execution.stdout.trim().length > 0 && (
              <details className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium">stdout</summary>
                <pre className="border-t bg-muted/50 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                  {run.execution.stdout}
                </pre>
              </details>
            )}

            {run.execution.stderr.trim().length > 0 && (
              <details className="rounded-lg border">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium">stderr</summary>
                <pre className="border-t bg-muted/50 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
                  {run.execution.stderr}
                </pre>
              </details>
            )}

            {run.execution.timedOut && (
              <p className="text-destructive text-sm">Execution timed out.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evaluation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="Resolved" value={run.evaluation.resolved ? "Yes" : "No"} />
              <Metric label="Tests" value={`${run.evaluation.testsPassed}/${run.evaluation.testsTotal}`} />
              <Metric
                label="Judge"
                value={
                  run.evaluation.judgeConfidence !== undefined
                    ? `${Math.round(run.evaluation.judgeConfidence * 100)}%`
                    : "—"
                }
              />
            </div>
            <form action={feedbackAction} className="flex flex-col gap-4">
              <input type="hidden" name="runId" value={run.id} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="userRating">Human rating</Label>
                <Select name="userRating" defaultValue={run.evaluation.userRating?.toString() ?? "none"}>
                  <SelectTrigger id="userRating" className="w-full">
                    <SelectValue placeholder="No rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No rating</SelectItem>
                    <SelectItem value="1">1 - poor</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3 - useful</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5 - excellent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Feedback notes</Label>
                <Textarea id="notes" name="notes" defaultValue={run.evaluation.notes ?? ""} />
              </div>
              <Button type="submit">Save feedback</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model-call trace</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {run.calls.map((call) => (
            <article key={call.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <span className="font-medium">{call.role}</span>
                <span className="text-muted-foreground">{call.model}</span>
                <span className="text-muted-foreground">{formatCostUsd(call.estimatedCostUsd)}</span>
                <span className="text-muted-foreground">{call.latencyMs} ms</span>
              </div>
              <pre className="bg-muted overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{call.response}</pre>
            </article>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

function mapRunStatus(status: string): "complete" | "failed" {
  return status === "completed" ? "complete" : "failed";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
