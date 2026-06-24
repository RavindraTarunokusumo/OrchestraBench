import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";
import { listRuns } from "@/lib/store/file-store";

const workflowCopy: Record<WorkflowKind, { name: string; description: string }> = {
  single_cheap: {
    name: "Single Cheap Model",
    description: "A low-cost model answers directly; the cheapest baseline."
  },
  single_strong: {
    name: "Single Strong Model",
    description: "A strong model answers directly; the quality baseline."
  },
  panel_judge: {
    name: "Panel + Judge",
    description: "Three models answer independently; a judge synthesizes consensus and contradictions."
  },
  cheap_first: {
    name: "Cheap-First Escalation",
    description: "A cheap model answers first; a verifier escalates to a stronger model only when confidence is low."
  },
  planner_worker_verifier: {
    name: "Planner → Worker → Verifier",
    description: "A planner decomposes, a worker checks, a verifier attacks, and a finalizer reports."
  }
};

export default async function HomePage() {
  const runs = await listRuns();
  const recentRuns = runs.slice(0, 5);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-12">
      <section className="flex flex-col gap-6 text-center sm:text-left">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">OrchestraBench</h1>
          <p className="text-muted-foreground max-w-2xl text-lg">
            An adaptive multi-model orchestration benchmarker for code review. It tests whether
            running several models together actually beats a single model once you account for
            real cost, latency, and quality constraints.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-start">
          <Button asChild size="lg">
            <Link href="/runs/new">New run</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/datasets">Datasets</Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Workflows</h2>
          <p className="text-muted-foreground">Five orchestration strategies, ready to compare on the same task.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflowKinds.map((workflow) => {
            const copy = workflowCopy[workflow];
            return (
              <Card key={workflow}>
                <CardHeader>
                  <CardTitle>{copy.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{copy.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Recent runs</h2>
            <p className="text-muted-foreground">The latest results across all workflows.</p>
          </div>
          {recentRuns.length > 0 && (
            <Button asChild variant="ghost">
              <Link href="/dashboard">View all</Link>
            </Button>
          )}
        </div>

        {recentRuns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-muted-foreground">No runs yet — start your first run.</p>
              <Button asChild>
                <Link href="/runs/new">New run</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentRuns.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="truncate">{run.title}</CardTitle>
                      <Badge variant={run.status === "completed" ? "default" : "secondary"}>{run.status}</Badge>
                    </div>
                    <CardDescription>{workflowCopy[run.workflow].name}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-col gap-1 text-sm">
                    <span>
                      Quality {run.evaluation.qualityScore.toFixed(1)} · Value{" "}
                      {run.evaluation.valueScore.toFixed(1)}
                    </span>
                    <span>${run.costUsd.toFixed(4)} · {Math.round(run.latencyMs)} ms</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
