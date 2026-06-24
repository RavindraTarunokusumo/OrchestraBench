import type { NodeState } from "@/components/orchestration/use-run-stream";
import type { RunResult, ModelCallTrace } from "@/lib/domain/types";
import type { WorkflowGraph } from "@/lib/workflows/graph";

const RESPONSE_PREVIEW_LENGTH = 200;

/**
 * Reconstructs a static nodeStates map for OrchestrationCanvas from a persisted
 * RunResult's call trace. Graph agent/judge/finalizer nodes are matched to calls
 * by role, consuming calls left-to-right so repeated-role nodes (e.g. panelist-1/2/3)
 * each get the next unused call of that role. Nodes with no matching call (e.g. a
 * cheap_first strong_reviewer when no escalation happened) are left at their default
 * "pending" state by the caller (OrchestrationCanvas already covers missing entries).
 */
export function deriveNodeStatesFromCalls(graph: WorkflowGraph, run: RunResult): Record<string, NodeState> {
  const callsByRole = new Map<string, ModelCallTrace[]>();
  for (const call of run.calls) {
    const queue = callsByRole.get(call.role) ?? [];
    queue.push(call);
    callsByRole.set(call.role, queue);
  }

  const nodeStates: Record<string, NodeState> = {};

  for (const node of graph.nodes) {
    if (node.kind === "input" || node.kind === "router") {
      nodeStates[node.id] = { status: "done" };
      continue;
    }

    if (node.kind === "result") {
      nodeStates[node.id] = { status: run.status === "completed" ? "done" : "failed" };
      continue;
    }

    if (!node.role) {
      continue;
    }

    const queue = callsByRole.get(node.role);
    const call = queue?.shift();
    if (!call) {
      continue;
    }

    nodeStates[node.id] = {
      status: call.error ? "failed" : "done",
      model: call.model,
      usage: call.usage,
      costUsd: call.estimatedCostUsd,
      latencyMs: call.latencyMs,
      responsePreview: call.response.slice(0, RESPONSE_PREVIEW_LENGTH)
    };
  }

  return nodeStates;
}
