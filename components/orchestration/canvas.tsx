"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { OrchestrationNode } from "@/components/orchestration/node";
import type { NodeState, RunStreamStatus, RunStreamTotals } from "@/components/orchestration/use-run-stream";
import type { GraphEdge, GraphNode, WorkflowGraph } from "@/lib/workflows/graph";
import { formatCostUsd } from "@/lib/utils";

export type OrchestrationCanvasProps = {
  graph: WorkflowGraph | null;
  nodeStates: Record<string, NodeState>;
  totals?: RunStreamTotals;
  escalation?: { escalated: boolean; reason: string } | null;
  status?: RunStreamStatus;
  mode: "live" | "static";
  finalRunId?: string | null;
};

const COLUMN_WIDTH = 196;
const ROW_HEIGHT = 96;
const NODE_WIDTH = 160;
const NODE_HEIGHT = 64;
const PADDING = 24;

function nodeCenter(node: GraphNode): { x: number; y: number } {
  return {
    x: PADDING + node.column * COLUMN_WIDTH + NODE_WIDTH / 2,
    y: PADDING + node.row * ROW_HEIGHT + NODE_HEIGHT / 2
  };
}

function edgePath(graph: WorkflowGraph, edge: GraphEdge): string {
  const from = graph.nodes.find((node) => node.id === edge.from);
  const to = graph.nodes.find((node) => node.id === edge.to);
  if (!from || !to) return "";
  const start = nodeCenter(from);
  const end = nodeCenter(to);
  const startX = start.x + NODE_WIDTH / 2;
  const endX = end.x - NODE_WIDTH / 2;
  const midX = (startX + endX) / 2;
  return `M ${startX} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${endX} ${end.y}`;
}

function canvasSize(graph: WorkflowGraph): { width: number; height: number } {
  const maxColumn = Math.max(0, ...graph.nodes.map((node) => node.column));
  const maxRow = Math.max(0, ...graph.nodes.map((node) => node.row));
  return {
    width: PADDING * 2 + (maxColumn + 1) * COLUMN_WIDTH,
    height: PADDING * 2 + (maxRow + 1) * ROW_HEIGHT
  };
}

function defaultNodeState(): NodeState {
  return { status: "pending" };
}

export function OrchestrationCanvas({
  graph,
  nodeStates,
  totals,
  escalation,
  status,
  mode,
  finalRunId
}: OrchestrationCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const { width, height } = useMemo(() => (graph ? canvasSize(graph) : { width: 0, height: 0 }), [graph]);

  const edgeStates = useMemo(() => {
    if (!graph) return [] as { edge: GraphEdge; path: string; flowing: boolean }[];
    return graph.edges.map((edge) => ({
      edge,
      path: edgePath(graph, edge),
      flowing: (nodeStates[edge.from]?.status === "done" || nodeStates[edge.from]?.status === "active") &&
        nodeStates[edge.to]?.status !== "pending"
    }));
  }, [graph, nodeStates]);

  // The GSAP context only needs rebuilding when the set of active node rings or
  // flowing edges changes — not on every stream event (preview/cost/total
  // updates leave it untouched), so unrelated active-node pulses keep running.
  const animationSignature = useMemo(() => {
    const activeNodes = Object.entries(nodeStates)
      .filter(([, state]) => state.status === "active")
      .map(([id]) => id)
      .sort()
      .join(",");
    const flowingEdges = edgeStates
      .filter((entry) => entry.flowing)
      .map((entry) => `${entry.edge.from}->${entry.edge.to}`)
      .sort()
      .join(",");
    return `${activeNodes}|${flowingEdges}`;
  }, [nodeStates, edgeStates]);

  useLayoutEffect(() => {
    if (!rootRef.current || !graph) return;

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-node-status='active']", { opacity: 1 });
        gsap.set("[data-edge-flowing='true']", { strokeDashoffset: 0 });
        return () => undefined;
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        if (mode === "live") {
          const primaryColor = getComputedStyle(rootRef.current as Element).getPropertyValue("--primary").trim();
          const pulses: gsap.core.Tween[] = [];
          const activeRings = rootRef.current?.querySelectorAll<HTMLElement>(".orchestration-node-ring");
          activeRings?.forEach((ring) => {
            pulses.push(
              gsap.fromTo(
                ring,
                { boxShadow: `0 0 0 0 ${primaryColor || "currentColor"}` },
                {
                  boxShadow: "0 0 0 6px transparent",
                  opacity: 0,
                  duration: 1.1,
                  repeat: -1,
                  ease: "sine.out"
                }
              )
            );
          });

          const flowingEdges = rootRef.current?.querySelectorAll<SVGPathElement>("[data-edge-flowing='true']");
          flowingEdges?.forEach((path) => {
            const length = path.getTotalLength();
            pulses.push(
              gsap.fromTo(path, { strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" })
            );
          });

          return () => {
            pulses.forEach((tween) => tween.kill());
          };
        }

        gsap.set("[data-edge-flowing='true']", { strokeDashoffset: 0 });
        return () => undefined;
      });

      return () => mm.revert();
    }, rootRef);

    return () => ctx.revert();
  }, [graph, animationSignature, mode]);

  if (!graph) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No orchestration graph yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" ref={rootRef}>
      {mode === "live" && (
        <OrchestrationHud totals={totals} escalation={escalation} status={status} finalRunId={finalRunId} />
      )}
      <div className="relative overflow-x-auto rounded-lg border bg-muted/20 p-2">
        <div className="relative" style={{ width, height }}>
          <svg
            className="absolute inset-0"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden
          >
            {edgeStates.map(({ edge, path, flowing }) => (
              <path
                key={`${edge.from}->${edge.to}`}
                d={path}
                data-edge-flowing={flowing}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={2}
                strokeDasharray={flowing ? "6 4" : undefined}
              />
            ))}
          </svg>
          {graph.nodes.map((node) => (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: PADDING + node.column * COLUMN_WIDTH + (COLUMN_WIDTH - NODE_WIDTH) / 2,
                top: PADDING + node.row * ROW_HEIGHT + (ROW_HEIGHT - NODE_HEIGHT) / 2,
                width: NODE_WIDTH
              }}
            >
              <OrchestrationNode node={node} state={nodeStates[node.id] ?? defaultNodeState()} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrchestrationHud({
  totals,
  escalation,
  status,
  finalRunId
}: {
  totals?: RunStreamTotals;
  escalation?: { escalated: boolean; reason: string } | null;
  status?: RunStreamStatus;
  finalRunId?: string | null;
}) {
  const stepsTotal = totals?.stepsTotal ?? 0;
  const stepsDone = totals?.stepsDone ?? 0;
  const progressValue = stepsTotal > 0 ? Math.min(100, (stepsDone / stepsTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium">{statusLabel(status)}</span>
          <span className="text-muted-foreground">Cost {formatCostUsd(totals?.costUsd ?? 0)}</span>
          <span className="text-muted-foreground">Latency {(totals?.latencyMs ?? 0).toLocaleString()}ms</span>
          <span className="text-muted-foreground">
            Tokens {((totals?.inputTokens ?? 0) + (totals?.outputTokens ?? 0)).toLocaleString()}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Step {stepsDone}/{stepsTotal}
        </span>
      </div>
      <Progress value={progressValue} />
      {escalation?.escalated && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>Escalated: {escalation.reason}</span>
        </div>
      )}
      {finalRunId && (
        <Badge variant="outline" className="w-fit">
          run {finalRunId}
        </Badge>
      )}
    </div>
  );
}

function statusLabel(status?: RunStreamStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}
