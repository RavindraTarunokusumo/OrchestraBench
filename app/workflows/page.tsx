import { OrchestrationCanvas } from "@/components/orchestration/canvas";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";
import { buildWorkflowGraph } from "@/lib/workflows/graph";
import { workflowLabels } from "@/lib/workflows/labels";

const DESCRIPTIONS: Record<WorkflowKind, string> = {
  single_cheap: "A single low-cost model proposes a fix directly — the cheapest baseline.",
  single_strong: "A single strong model proposes a fix directly — the quality baseline.",
  panel_judge: "Three models each propose a fix independently; a judge merges them into one corrected version.",
  cheap_first:
    "A cheap model fixes first and a verifier scores confidence; if it's low, the run escalates to a stronger model. The most practical value workflow.",
  planner_worker_verifier:
    "A planner plans the fix, a worker produces a corrected version, a verifier critiques it, and a finalizer synthesizes the final fix — the most agent-like workflow."
};

const TAGS: Record<WorkflowKind, string> = {
  single_cheap: "Lowest cost",
  single_strong: "Quality baseline",
  panel_judge: "Highest cost",
  cheap_first: "Best value",
  planner_worker_verifier: "Most thorough"
};

export default function WorkflowsPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orchestration workflows</h1>
        <p className="text-muted-foreground">
          These are the five strategies the benchmarker compares for fixing buggy code, trading cost against
          resolve rate.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {workflowKinds.map((kind) => {
          const graph = buildWorkflowGraph(kind);
          const flow = [...graph.nodes]
            .sort((a, b) => a.column - b.column || a.row - b.row)
            .map((node) => node.label)
            .join(" → ");
          return (
            <Card key={kind}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="leading-none font-semibold">{workflowLabels[kind]}</h2>
                  <Badge variant="outline">{TAGS[kind]}</Badge>
                </div>
                <CardDescription>{DESCRIPTIONS[kind]}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <OrchestrationCanvas graph={graph} nodeStates={{}} mode="static" />
                <p className="text-xs text-muted-foreground">Flow: {flow}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
