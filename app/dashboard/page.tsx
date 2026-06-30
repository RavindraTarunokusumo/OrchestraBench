import Link from "next/link";
import { WorkflowCharts } from "@/components/dashboard/workflow-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { chartableSummaries, summarizeByWorkflow } from "@/lib/dashboard/aggregate";
import { listBenchmarks } from "@/lib/benchmarks/catalog";
import { listDatasets, listRuns } from "@/lib/store/file-store";
import { formatCostUsd, formatScore } from "@/lib/utils";

export default async function DashboardPage() {
  const [runs, tasks] = await Promise.all([listRuns(), listDatasets()]);
  const benchmarks = listBenchmarks(tasks, runs);
  const summaries = summarizeByWorkflow(runs);
  const totalResolved = runs.filter((run) => run.evaluation?.resolved).length;
  const overallResolveRate = runs.length > 0 ? totalResolved / runs.length : 0;
  const overallAvgValue =
    runs.length > 0 ? runs.reduce((sum, run) => sum + (run.evaluation?.valueScore ?? 0), 0) / runs.length : 0;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparison dashboard</h1>
          <p className="text-muted-foreground">
            Browse benchmarks and rank orchestration workflows by resolve rate, cost, latency, and value score.
          </p>
        </div>
      </div>

      <section id="benchmarks" className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Benchmarks</h2>
          <p className="text-muted-foreground text-sm">
            Select a benchmark to inspect tasks or run the full suite.
          </p>
        </div>

        {benchmarks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-muted-foreground">
                No benchmarks yet — ingest QuixBugs to get started.
              </p>
              <p className="text-muted-foreground font-mono text-sm">npm run ingest:quixbugs</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benchmarks.map((benchmark) => (
              <Link key={benchmark.slug} href={`/benchmarks/${benchmark.slug}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary">
                  <CardHeader>
                    <CardTitle>{benchmark.name}</CardTitle>
                    <CardDescription>
                      {benchmark.taskCount} task{benchmark.taskCount === 1 ? "" : "s"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {(benchmark.resolvedRate * 100).toFixed(0)}% resolved
                    </span>
                    <Badge variant="outline">View tasks</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-muted-foreground">
              No runs yet — open a benchmark and run a task to populate workflow comparisons.
            </p>
            {benchmarks.length > 0 ? (
              <Button asChild>
                <Link href={`/benchmarks/${benchmarks[0]!.slug}`}>Browse benchmarks</Link>
              </Button>
            ) : null}
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
                <CardTitle className="text-3xl">{formatScore(overallAvgValue)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Resolve rate vs cost</h2>
              <p className="text-muted-foreground text-sm">
                Per-workflow resolve rate and value score across completed and failed runs.
              </p>
            </div>
            <WorkflowCharts
              rows={chartableSummaries(summaries).map((s) => ({
                workflow: s.workflow,
                resolveRate: s.resolveRate,
                avgValue: s.avgValue,
                avgCost: s.avgCost,
                count: s.count
              }))}
            />
          </div>

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
                  {summaries.map((row) => (
                    <TableRow key={row.workflow}>
                      <TableCell className="font-medium">{row.workflow}</TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>
                        {row.count === 0
                          ? "—"
                          : `${(row.resolveRate * 100).toFixed(0)}% (${row.resolvedCount}/${row.count})`}
                      </TableCell>
                      <TableCell>{row.count === 0 ? "—" : formatScore(row.avgValue)}</TableCell>
                      <TableCell>{row.count === 0 ? "—" : formatCostUsd(row.avgCost)}</TableCell>
                      <TableCell>{row.count === 0 ? "—" : `${Math.round(row.avgLatencyMs)} ms`}</TableCell>
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
                      {run.evaluation?.resolved ? "Resolved" : "Unresolved"} · {run.evaluation?.testsPassed ?? 0}/
                      {run.evaluation?.testsTotal ?? 0} tests · Value {formatScore(run.evaluation?.valueScore ?? 0)}
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
