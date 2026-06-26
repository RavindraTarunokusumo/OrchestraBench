import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";
import { listRuns } from "@/lib/store/file-store";

export default async function DashboardPage() {
  const runs = await listRuns();
  const rows = workflowKinds.map((workflow) => summarize(workflow, runs.filter((run) => run.workflow === workflow)));
  const totalResolved = runs.filter((run) => run.evaluation.resolved).length;
  const overallResolveRate = runs.length > 0 ? totalResolved / runs.length : 0;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparison dashboard</h1>
          <p className="text-muted-foreground">
            Rank orchestration workflows by resolve rate, cost, latency, and value score.
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
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total runs</CardDescription>
                <CardTitle className="text-3xl">{runs.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Resolve rate</CardDescription>
                <CardTitle className="text-3xl">{(overallResolveRate * 100).toFixed(0)}%</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {totalResolved} of {runs.length} runs resolved
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Avg value score</CardDescription>
                <CardTitle className="text-3xl">{avg(runs.map((run) => run.evaluation.valueScore)).toFixed(1)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Repair metrics — full view in Phase 2</CardTitle>
              <CardDescription>
                Interactive resolve-rate and value-score charts will ship in the next dashboard phase.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Per-workflow resolve rate and value score are available in the comparison table below.
            </CardContent>
          </Card>

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
                    <TableHead>Resolve rate</TableHead>
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
                      <TableCell>
                        {row.count === 0 ? "—" : `${(row.resolveRate * 100).toFixed(0)}% (${row.resolvedCount}/${row.count})`}
                      </TableCell>
                      <TableCell>{row.count === 0 ? "—" : row.value.toFixed(1)}</TableCell>
                      <TableCell>{row.count === 0 ? "—" : `$${row.cost.toFixed(4)}`}</TableCell>
                      <TableCell>{row.count === 0 ? "—" : `${Math.round(row.latency)} ms`}</TableCell>
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
                      {run.evaluation.resolved ? "Resolved" : "Unresolved"} · {run.evaluation.testsPassed}/
                      {run.evaluation.testsTotal} tests · Value {run.evaluation.valueScore.toFixed(1)}
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
    return { workflow, count: 0, resolvedCount: 0, resolveRate: 0, value: 0, cost: 0, latency: 0 };
  }

  const resolvedCount = runs.filter((run) => run.evaluation.resolved).length;

  return {
    workflow,
    count: runs.length,
    resolvedCount,
    resolveRate: resolvedCount / runs.length,
    value: avg(runs.map((run) => run.evaluation.valueScore)),
    cost: avg(runs.map((run) => run.costUsd)),
    latency: avg(runs.map((run) => run.latencyMs))
  };
}

function avg(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
