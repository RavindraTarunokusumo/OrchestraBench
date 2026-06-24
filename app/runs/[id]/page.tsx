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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getRun } from "@/lib/store/file-store";
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Quality" value={run.evaluation.qualityScore.toFixed(1)} />
        <Metric label="Value" value={run.evaluation.valueScore.toFixed(1)} />
        <Metric label="Cost" value={`$${run.costUsd.toFixed(4)}`} />
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
            <div className="flex items-center gap-2">
              <Badge variant={run.escalated ? "secondary" : "outline"}>
                {run.escalated ? "Escalated" : "No escalation"}
              </Badge>
            </div>
            {run.escalationReason && <CardDescription>{run.escalationReason}</CardDescription>}
            <CardTitle>Final answer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">{run.finalAnswer}</p>
            <div>
              <h3 className="mb-2 text-sm font-medium">Findings</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Finding</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.findings.map((finding) => (
                    <TableRow key={finding.id}>
                      <TableCell>
                        <span className="font-medium">{finding.title}</span>
                        <p className="text-muted-foreground text-sm">{finding.description}</p>
                      </TableCell>
                      <TableCell>{finding.severity}</TableCell>
                      <TableCell>{Math.round(finding.confidence * 100)}%</TableCell>
                      <TableCell>{finding.sourceRole}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evaluation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="TP" value={run.evaluation.truePositives} />
              <Metric label="FP" value={run.evaluation.falsePositives} />
              <Metric label="Missed" value={run.evaluation.missedKnownBugs} />
              <Metric label="Judge" value={`${Math.round(run.evaluation.judgeConfidence * 100)}%`} />
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
                <span className="text-muted-foreground">${call.estimatedCostUsd.toFixed(4)}</span>
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
