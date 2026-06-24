import type { ModelRole, WorkflowKind } from "@/lib/domain/types";

export type GraphNodeKind = "input" | "router" | "agent" | "judge" | "finalizer" | "result";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  role?: ModelRole;
  model?: string;
  column: number;
  row: number;
};

export type GraphEdge = { from: string; to: string };

export type WorkflowGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

const INPUT_NODE: GraphNode = { id: "input", kind: "input", label: "Input", column: 0, row: 0 };
const ROUTER_NODE: GraphNode = { id: "router", kind: "router", label: "Router", column: 1, row: 0 };

export function buildWorkflowGraph(workflow: WorkflowKind): WorkflowGraph {
  switch (workflow) {
    case "single_cheap":
      return buildLinearAgentGraph({
        id: "cheap_reviewer",
        role: "cheap_reviewer",
        label: "Cheap reviewer"
      });
    case "single_strong":
      return buildLinearAgentGraph({
        id: "strong_reviewer",
        role: "strong_reviewer",
        label: "Strong reviewer"
      });
    case "panel_judge":
      return buildPanelJudgeGraph();
    case "cheap_first":
      return buildCheapFirstGraph();
    case "planner_worker_verifier":
      return buildPlannerWorkerVerifierGraph();
    default:
      throw new Error(`Unknown workflow kind: ${workflow as string}`);
  }
}

function buildLinearAgentGraph(agent: { id: string; role: ModelRole; label: string }): WorkflowGraph {
  const agentNode: GraphNode = { id: agent.id, kind: "agent", label: agent.label, role: agent.role, column: 2, row: 0 };
  const resultNode: GraphNode = { id: "result", kind: "result", label: "Result", column: 3, row: 0 };

  return {
    nodes: [INPUT_NODE, ROUTER_NODE, agentNode, resultNode],
    edges: [
      { from: "input", to: "router" },
      { from: "router", to: agent.id },
      { from: agent.id, to: "result" }
    ]
  };
}

function buildPanelJudgeGraph(): WorkflowGraph {
  const panelists: GraphNode[] = [1, 2, 3].map((index) => ({
    id: `panelist-${index}`,
    kind: "agent",
    label: `Panel reviewer ${index}`,
    role: "panelist",
    column: 2,
    row: index - 1
  }));
  const judgeNode: GraphNode = { id: "judge", kind: "judge", label: "Judge", role: "judge", column: 3, row: 0 };
  const resultNode: GraphNode = { id: "result", kind: "result", label: "Result", column: 4, row: 0 };

  return {
    nodes: [INPUT_NODE, ROUTER_NODE, ...panelists, judgeNode, resultNode],
    edges: [
      { from: "input", to: "router" },
      ...panelists.map((node) => ({ from: "router", to: node.id })),
      ...panelists.map((node) => ({ from: node.id, to: "judge" })),
      { from: "judge", to: "result" }
    ]
  };
}

function buildCheapFirstGraph(): WorkflowGraph {
  const cheapNode: GraphNode = {
    id: "cheap_reviewer",
    kind: "agent",
    label: "Cheap reviewer",
    role: "cheap_reviewer",
    column: 2,
    row: 0
  };
  const verifierNode: GraphNode = {
    id: "verifier",
    kind: "agent",
    label: "Verifier",
    role: "verifier",
    column: 3,
    row: 0
  };
  const strongNode: GraphNode = {
    id: "strong_reviewer",
    kind: "agent",
    label: "Strong reviewer (escalation)",
    role: "strong_reviewer",
    column: 4,
    row: 0
  };
  const resultNode: GraphNode = { id: "result", kind: "result", label: "Result", column: 5, row: 0 };

  return {
    nodes: [INPUT_NODE, ROUTER_NODE, cheapNode, verifierNode, strongNode, resultNode],
    edges: [
      { from: "input", to: "router" },
      { from: "router", to: "cheap_reviewer" },
      { from: "cheap_reviewer", to: "verifier" },
      { from: "verifier", to: "strong_reviewer" },
      { from: "strong_reviewer", to: "result" }
    ]
  };
}

function buildPlannerWorkerVerifierGraph(): WorkflowGraph {
  const plannerNode: GraphNode = { id: "planner", kind: "agent", label: "Planner", role: "planner", column: 2, row: 0 };
  const workerNode: GraphNode = { id: "worker", kind: "agent", label: "Worker", role: "worker", column: 3, row: 0 };
  const verifierNode: GraphNode = {
    id: "verifier",
    kind: "agent",
    label: "Verifier",
    role: "verifier",
    column: 4,
    row: 0
  };
  const finalizerNode: GraphNode = {
    id: "finalizer",
    kind: "finalizer",
    label: "Finalizer",
    role: "finalizer",
    column: 5,
    row: 0
  };
  const resultNode: GraphNode = { id: "result", kind: "result", label: "Result", column: 6, row: 0 };

  return {
    nodes: [INPUT_NODE, ROUTER_NODE, plannerNode, workerNode, verifierNode, finalizerNode, resultNode],
    edges: [
      { from: "input", to: "router" },
      { from: "router", to: "planner" },
      { from: "planner", to: "worker" },
      { from: "worker", to: "verifier" },
      { from: "verifier", to: "finalizer" },
      { from: "finalizer", to: "result" }
    ]
  };
}
