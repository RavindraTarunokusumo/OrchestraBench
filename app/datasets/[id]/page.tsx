import Link from "next/link";
import { notFound } from "next/navigation";
import { rerunDatasetAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { workflowKinds } from "@/lib/domain/types";
import { getDataset, listRuns } from "@/lib/store/file-store";

export default async function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getDataset(id);
  if (!task) {
    notFound();
  }
  const relatedRuns = (await listRuns()).filter((run) => run.benchmarkTaskId === task.id);
  const knownBugs = task.knownBugs ?? [];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
          <p className="text-muted-foreground">
            {task.source} · {task.language} · {task.tags.join(", ") || "untagged"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/datasets">Back to datasets</Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Task</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">{task.prompt}</p>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Buggy code</h3>
              <pre className="bg-muted overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{task.code}</pre>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Test code</h3>
              <pre className="bg-muted overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                {task.testCode || "No test code provided."}
              </pre>
            </div>
            {task.referenceFix ? (
              <details className="rounded-lg border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Reveal answer key</summary>
                <pre className="overflow-auto px-3 pb-3 text-xs whitespace-pre-wrap">{task.referenceFix}</pre>
              </details>
            ) : null}
            {knownBugs.length > 0 ? (
              <>
                <h3 className="text-sm font-medium">Known bugs</h3>
                <div className="flex flex-col gap-2">
                  {knownBugs.map((bug) => (
                    <Card key={bug.id}>
                      <CardHeader>
                        <CardTitle className="text-base">{bug.title}</CardTitle>
                        <CardDescription>
                          {bug.severity} · {bug.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Rerun workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={rerunDatasetAction} className="flex flex-col gap-4">
                <input type="hidden" name="taskId" value={task.id} />
                <div className="grid grid-cols-2 gap-2">
                  {workflowKinds.map((workflow) => (
                    <label
                      key={workflow}
                      className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <input type="checkbox" name="workflows" value={workflow} defaultChecked className="size-4" />
                      <span>{workflow}</span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="costLimitUsd">Cost limit USD</Label>
                  <Input id="costLimitUsd" name="costLimitUsd" type="number" step="0.0001" min="0" />
                </div>
                <Button type="submit">Rerun selected</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Related runs</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {relatedRuns.length === 0 ? (
                <p className="text-muted-foreground text-sm">No reruns yet.</p>
              ) : (
                relatedRuns.map((run) => (
                  <Link key={run.id} href={`/runs/${run.id}`} className="group">
                    <Card className="transition-colors group-hover:border-primary">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{run.workflow}</CardTitle>
                          <Badge variant="outline">
                            {run.evaluation.resolved ? "Resolved" : "Unresolved"} · Value{" "}
                            {run.evaluation.valueScore.toFixed(1)}
                          </Badge>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
