import { describe, expect, it } from "vitest";
import { buildWorkflowGraph } from "@/lib/workflows/graph";

describe("buildWorkflowGraph", () => {
  it("builds input -> router -> cheap_reviewer -> result for single_cheap", () => {
    const graph = buildWorkflowGraph("single_cheap");

    expect(graph.nodes.map((node) => node.id)).toEqual(["input", "router", "cheap_reviewer", "result"]);
    expect(graph.nodes.map((node) => node.kind)).toEqual(["input", "router", "agent", "result"]);
    expect(graph.nodes.find((node) => node.id === "cheap_reviewer")).toMatchObject({
      role: "cheap_reviewer",
      column: 2,
      row: 0
    });
    expect(graph.edges).toEqual([
      { from: "input", to: "router" },
      { from: "router", to: "cheap_reviewer" },
      { from: "cheap_reviewer", to: "result" }
    ]);
  });

  it("builds input -> router -> strong_reviewer -> result for single_strong", () => {
    const graph = buildWorkflowGraph("single_strong");

    expect(graph.nodes.map((node) => node.id)).toEqual(["input", "router", "strong_reviewer", "result"]);
    expect(graph.nodes.find((node) => node.id === "strong_reviewer")).toMatchObject({
      kind: "agent",
      role: "strong_reviewer",
      column: 2,
      row: 0
    });
    expect(graph.edges).toEqual([
      { from: "input", to: "router" },
      { from: "router", to: "strong_reviewer" },
      { from: "strong_reviewer", to: "result" }
    ]);
  });

  it("builds input -> router -> [panelist-1/2/3] -> judge -> result for panel_judge", () => {
    const graph = buildWorkflowGraph("panel_judge");

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "input",
      "router",
      "panelist-1",
      "panelist-2",
      "panelist-3",
      "judge",
      "result"
    ]);

    const panelists = graph.nodes.filter((node) => node.id.startsWith("panelist-"));
    expect(panelists).toHaveLength(3);
    panelists.forEach((node, index) => {
      expect(node.kind).toBe("agent");
      expect(node.role).toBe("panelist");
      expect(node.column).toBe(2);
      expect(node.row).toBe(index);
    });

    const judge = graph.nodes.find((node) => node.id === "judge");
    expect(judge).toMatchObject({ kind: "judge", role: "judge", column: 3, row: 0 });

    const result = graph.nodes.find((node) => node.id === "result");
    expect(result).toMatchObject({ kind: "result", column: 4, row: 0 });

    expect(graph.edges).toEqual([
      { from: "input", to: "router" },
      { from: "router", to: "panelist-1" },
      { from: "router", to: "panelist-2" },
      { from: "router", to: "panelist-3" },
      { from: "panelist-1", to: "judge" },
      { from: "panelist-2", to: "judge" },
      { from: "panelist-3", to: "judge" },
      { from: "judge", to: "result" }
    ]);
  });

  it("builds input -> router -> cheap_reviewer -> verifier -> strong_reviewer(escalation) -> result for cheap_first", () => {
    const graph = buildWorkflowGraph("cheap_first");

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "input",
      "router",
      "cheap_reviewer",
      "verifier",
      "strong_reviewer",
      "result"
    ]);

    const cheap = graph.nodes.find((node) => node.id === "cheap_reviewer");
    expect(cheap).toMatchObject({ kind: "agent", role: "cheap_reviewer", column: 2, row: 0 });

    const verifier = graph.nodes.find((node) => node.id === "verifier");
    expect(verifier).toMatchObject({ kind: "agent", role: "verifier", column: 3, row: 0 });

    const strong = graph.nodes.find((node) => node.id === "strong_reviewer");
    expect(strong).toMatchObject({ kind: "agent", role: "strong_reviewer", column: 4, row: 0 });
    expect(strong?.label.toLowerCase()).toContain("escalat");

    expect(graph.edges).toEqual([
      { from: "input", to: "router" },
      { from: "router", to: "cheap_reviewer" },
      { from: "cheap_reviewer", to: "verifier" },
      { from: "verifier", to: "strong_reviewer" },
      { from: "strong_reviewer", to: "result" }
    ]);
  });

  it("builds input -> router -> planner -> worker -> verifier -> finalizer -> result for planner_worker_verifier", () => {
    const graph = buildWorkflowGraph("planner_worker_verifier");

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "input",
      "router",
      "planner",
      "worker",
      "verifier",
      "finalizer",
      "result"
    ]);

    expect(graph.nodes.find((node) => node.id === "planner")).toMatchObject({ kind: "agent", role: "planner" });
    expect(graph.nodes.find((node) => node.id === "worker")).toMatchObject({ kind: "agent", role: "worker" });
    expect(graph.nodes.find((node) => node.id === "verifier")).toMatchObject({ kind: "agent", role: "verifier" });
    expect(graph.nodes.find((node) => node.id === "finalizer")).toMatchObject({ kind: "finalizer", role: "finalizer" });

    expect(graph.edges).toEqual([
      { from: "input", to: "router" },
      { from: "router", to: "planner" },
      { from: "planner", to: "worker" },
      { from: "worker", to: "verifier" },
      { from: "verifier", to: "finalizer" },
      { from: "finalizer", to: "result" }
    ]);
  });

  it("is deterministic across repeated calls", () => {
    const a = buildWorkflowGraph("panel_judge");
    const b = buildWorkflowGraph("panel_judge");

    expect(a).toEqual(b);
  });

  it("every node has a unique id within a workflow", () => {
    const kinds: Array<Parameters<typeof buildWorkflowGraph>[0]> = [
      "single_cheap",
      "single_strong",
      "panel_judge",
      "cheap_first",
      "planner_worker_verifier"
    ];

    for (const kind of kinds) {
      const graph = buildWorkflowGraph(kind);
      const ids = graph.nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
