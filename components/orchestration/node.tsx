"use client";

import {
  Bot,
  CircleCheck,
  CircleX,
  Gavel,
  LogIn,
  Route,
  ScrollText,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeRunStatus, NodeState } from "@/components/orchestration/use-run-stream";
import type { GraphNode, GraphNodeKind } from "@/lib/workflows/graph";

export type OrchestrationNodeProps = {
  node: GraphNode;
  state: NodeState;
};

const KIND_ICONS: Record<GraphNodeKind, LucideIcon> = {
  input: LogIn,
  router: Route,
  agent: Bot,
  judge: Gavel,
  finalizer: ScrollText,
  result: CircleCheck
};

const STATUS_CARD_CLASSES: Record<NodeRunStatus, string> = {
  pending: "border-border bg-card/60 text-muted-foreground",
  active: "border-primary bg-card text-foreground shadow-md",
  done: "border-accent bg-card text-foreground",
  failed: "border-destructive bg-destructive/10 text-foreground"
};

const STATUS_ICON_CLASSES: Record<NodeRunStatus, string> = {
  pending: "text-muted-foreground",
  active: "text-primary",
  done: "text-foreground",
  failed: "text-destructive"
};

export function formatTokens(usage: NodeState["usage"]): string | null {
  if (!usage) return null;
  return `${usage.inputTokens + usage.outputTokens} tok`;
}

export function formatCost(costUsd: number | undefined): string | null {
  if (costUsd === undefined) return null;
  return `$${costUsd.toFixed(4)}`;
}

export function formatLatency(latencyMs: number | undefined): string | null {
  if (latencyMs === undefined) return null;
  return latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)}s` : `${latencyMs}ms`;
}

export function OrchestrationNode({ node, state }: OrchestrationNodeProps) {
  const Icon = KIND_ICONS[node.kind];
  const tokens = formatTokens(state.usage);
  const cost = formatCost(state.costUsd);
  const latency = formatLatency(state.latencyMs);
  const showMetrics = state.status === "done" && (tokens || cost || latency);

  return (
    <div
      data-node-id={node.id}
      data-node-status={state.status}
      className={cn(
        "relative flex w-40 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
        STATUS_CARD_CLASSES[state.status]
      )}
    >
      <div className="flex items-center gap-2">
        {state.status === "failed" ? (
          <CircleX className="size-4 shrink-0 text-destructive" aria-hidden />
        ) : (
          <Icon className={cn("size-4 shrink-0", STATUS_ICON_CLASSES[state.status])} aria-hidden />
        )}
        <span className="truncate text-sm font-medium">{node.label}</span>
      </div>
      {(state.model ?? node.model) && (
        <span className="truncate text-xs text-muted-foreground">{state.model ?? node.model}</span>
      )}
      {showMetrics && (
        <div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
          {cost && <span>{cost}</span>}
          {latency && <span>{latency}</span>}
          {tokens && <span>{tokens}</span>}
        </div>
      )}
      {state.status === "active" && (
        <span className="orchestration-node-ring pointer-events-none absolute inset-0 rounded-lg" aria-hidden />
      )}
    </div>
  );
}
