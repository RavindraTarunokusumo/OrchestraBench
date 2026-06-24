import Link from "next/link";
import { WorkflowCharts, type WorkflowChartRow } from "@/components/dashboard/workflow-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";
import { listRuns } from "@/lib/store/file-store";

export default async function DashboardPage() {
  const runs = await listRuns();
  const rows = workflowKinds.map((workflow) => summarize(workflow, runs.filter((run) => run.workflow === workflow)));
  const chartRows: WorkflowChartRow[] = rows.map((row) => ({
    workflow: row.workflow,
    quality: Number(row.quality.toFixed(2)),
    value: Number(row.value.toFixed(2)),
    cost: Number(row.cost.toFixed(4))
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparison dashboard</h1>
          <p className="text-muted-foreground">
            Rank orchestration workflows by quality, cost, latency, and value score.
          </p>
        </div>
        <Button asChild>
          <Link href="/runs/new">New run</Link>
        </Button>
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground">No runs yet — start a run to populate the dashboard.</p>
            <Button asChild>
              <Link href="/runs/new">New run</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <WorkflowCharts rows={chartRows} />

          <Card>
            <CardHeader>
              <CardTitle>Workflow comparison</CardTitle>
              <CardDescription>Averages across all completed and failed runs per workflow.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Runs</TableHead>
                    <TableHead>Avg quality</TableHead>
                    <TableHead>Avg value</TableHead>
                    <TableHead>Avg cost</TableHead>
                    <TableHead>Avg latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.workflow}>
                      <TableCell className="font-medium">{row.workflow}</TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>{row.quality.toFixed(1)}</TableCell>
                      <TableCell>{row.value.toFixed(1)}</TableCell>
                      <TableCell>${row.cost.toFixed(4)}</TableCell>
                      <TableCell>{Math.round(row.latency)} ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold tracking-tight">Recent runs</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {runs.slice(0, 10).map((run) => (
                <Link key={run.id} href={`/runs/${run.id}`} className="group">
                  <Card className="h-full transition-colors group-hover:border-primary">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="truncate">{run.title}</CardTitle>
                        <Badge variant={run.status === "completed" ? "default" : "secondary"}>{run.status}</Badge>
                      </div>
                      <CardDescription>{run.workflow}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-muted-foreground text-sm">
                      Quality {run.evaluation.qualityScore.toFixed(1)} · Value {run.evaluation.valueScore.toFixed(1)}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function summarize(workflow: WorkflowKind, runs: Awaited<ReturnType<typeof listRuns>>) {
  if (runs.length === 0) {
    return { workflow, count: 0, quality: 0, value: 0, cost: 0, latency: 0 };
  }

  return {
    workflow,
    count: runs.length,
    quality: avg(runs.map((run) => run.evaluation.qualityScore)),
    value: avg(runs.map((run) => run.evaluation.valueScore)),
    cost: avg(runs.map((run) => run.costUsd)),
    latency: avg(runs.map((run) => run.latencyMs))
  };
}

function avg(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
