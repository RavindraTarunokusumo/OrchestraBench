"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutionResult, RunInput, RunStatus } from "@/lib/domain/types";
import type { WorkflowEvent } from "@/lib/workflows/events";
import type { WorkflowGraph } from "@/lib/workflows/graph";
import { parseSseChunk } from "@/lib/workflows/sse";

export type NodeRunStatus = "pending" | "active" | "done" | "failed";

export type NodeState = {
  status: NodeRunStatus;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  latencyMs?: number;
  responsePreview?: string;
};

export type RunStreamTotals = {
  costUsd: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  stepsDone: number;
  stepsTotal: number;
};

export type RunStreamStatus = "idle" | "running" | "complete" | "failed" | "error";

export type RunFinalSummary = {
  status: RunStatus;
  costUsd: number;
  latencyMs: number;
  executionMs: number;
  resolved: boolean;
  testsPassed: number;
  testsTotal: number;
  valueScore: number;
  candidateCode: string;
};

export type RunStreamState = {
  status: RunStreamStatus;
  graph: WorkflowGraph | null;
  nodeStates: Record<string, NodeState>;
  totals: RunStreamTotals;
  escalation: { escalated: boolean; reason: string } | null;
  finalRunId: string | null;
  finalSummary: RunFinalSummary | null;
  executionResult: ExecutionResult | null;
  error: string | null;
};

const ZERO_TOTALS: RunStreamTotals = {
  costUsd: 0,
  latencyMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  stepsDone: 0,
  stepsTotal: 0
};

export const initialRunStreamState: RunStreamState = {
  status: "idle",
  graph: null,
  nodeStates: {},
  totals: ZERO_TOTALS,
  escalation: null,
  finalRunId: null,
  finalSummary: null,
  executionResult: null,
  error: null
};

/** Node kinds that are not driven by step-start/step-finish events. */
const NON_AGENT_KINDS = new Set(["input", "router", "result"]);

/**
 * Pure reducer mapping a single WorkflowEvent onto the previous RunStreamState.
 * No DOM/timer access — the minimum-active-duration behavior is layered on top
 * by the React hook, not here.
 */
export function reduceStreamEvent(prev: RunStreamState, event: WorkflowEvent): RunStreamState {
  switch (event.type) {
    case "run-init": {
      const nodeStates: Record<string, NodeState> = {};
      for (const node of event.graph.nodes) {
        const isImmediatelyDone = node.kind === "input" || node.kind === "router";
        nodeStates[node.id] = { status: isImmediatelyDone ? "done" : "pending" };
      }
      return {
        ...prev,
        status: "running",
        graph: event.graph,
        nodeStates,
        totals: { ...ZERO_TOTALS, stepsTotal: event.plannedSteps.length },
        escalation: null,
        finalRunId: null,
        finalSummary: null,
        executionResult: null,
        error: null
      };
    }
    case "step-start": {
      return {
        ...prev,
        nodeStates: {
          ...prev.nodeStates,
          [event.nodeId]: { ...prev.nodeStates[event.nodeId], status: "active", model: event.model }
        }
      };
    }
    case "step-finish": {
      const nextState: NodeState = {
        status: "done",
        model: event.model,
        usage: event.usage,
        costUsd: event.costUsd,
        latencyMs: event.latencyMs,
        responsePreview: event.responsePreview
      };
      return {
        ...prev,
        nodeStates: { ...prev.nodeStates, [event.nodeId]: nextState },
        totals: {
          costUsd: prev.totals.costUsd + event.costUsd,
          latencyMs: prev.totals.latencyMs + event.latencyMs,
          inputTokens: prev.totals.inputTokens + event.usage.inputTokens,
          outputTokens: prev.totals.outputTokens + event.usage.outputTokens,
          stepsDone: prev.totals.stepsDone + 1,
          stepsTotal: prev.totals.stepsTotal
        }
      };
    }
    case "escalation": {
      return { ...prev, escalation: { escalated: event.escalated, reason: event.reason } };
    }
    case "execution-result": {
      return { ...prev, executionResult: event.result };
    }
    case "run-final": {
      const runFailed = event.status === "failed";
      const resultNodeId = prev.graph?.nodes.find((node) => node.kind === "result")?.id;
      const nodeStates = resultNodeId
        ? {
            ...prev.nodeStates,
            [resultNodeId]: {
              ...prev.nodeStates[resultNodeId],
              status: (runFailed ? "failed" : "done") as NodeRunStatus
            }
          }
        : prev.nodeStates;
      return {
        ...prev,
        status: runFailed ? "failed" : "complete",
        finalRunId: event.runId,
        finalSummary: {
          status: event.status,
          costUsd: event.costUsd,
          latencyMs: event.latencyMs,
          executionMs: event.executionMs,
          resolved: event.resolved,
          testsPassed: event.testsPassed,
          testsTotal: event.testsTotal,
          valueScore: event.valueScore,
          candidateCode: event.candidateCode
        },
        nodeStates,
        totals: {
          ...prev.totals,
          costUsd: event.costUsd,
          latencyMs: event.latencyMs
        }
      };
    }
    case "run-error": {
      return { ...prev, status: "error", error: event.message };
    }
    default:
      return prev;
  }
}

/**
 * Marks any node left "active" with no terminal event as "failed". Used when the
 * stream ends (reader closes) without a run-final/run-error — e.g. a mid-run
 * provider crash that never emits step-finish for the in-flight node.
 */
export function markStalledActiveNodesFailed(state: RunStreamState): RunStreamState {
  const hasActive = Object.values(state.nodeStates).some((node) => node.status === "active");
  if (!hasActive) return state;
  const nodeStates: Record<string, NodeState> = {};
  for (const [nodeId, nodeState] of Object.entries(state.nodeStates)) {
    nodeStates[nodeId] = nodeState.status === "active" ? { ...nodeState, status: "failed" } : nodeState;
  }
  return { ...state, status: state.status === "running" ? "failed" : state.status, nodeStates };
}

const MIN_ACTIVE_DURATION_MS = 500;

export type UseRunStreamResult = RunStreamState & { start: (input: RunInput) => void };

export function useRunStream(): UseRunStreamResult {
  const [state, setState] = useState<RunStreamState>(initialRunStreamState);
  const activeSinceRef = useRef<Map<string, number>>(new Map());
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const timers = pendingTimersRef.current;
    return () => {
      mountedRef.current = false;
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const applyEvent = useCallback((event: WorkflowEvent) => {
    if (!mountedRef.current) return;

    if (event.type === "step-start") {
      activeSinceRef.current.set(event.nodeId, Date.now());
      const existingTimer = pendingTimersRef.current.get(event.nodeId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        pendingTimersRef.current.delete(event.nodeId);
      }
      setState((prev) => reduceStreamEvent(prev, event));
      return;
    }

    if (event.type === "step-finish") {
      const activeSince = activeSinceRef.current.get(event.nodeId);
      const elapsed = activeSince ? Date.now() - activeSince : MIN_ACTIVE_DURATION_MS;
      const remaining = Math.max(0, MIN_ACTIVE_DURATION_MS - elapsed);

      if (remaining === 0) {
        activeSinceRef.current.delete(event.nodeId);
        setState((prev) => reduceStreamEvent(prev, event));
        return;
      }

      const timer = setTimeout(() => {
        pendingTimersRef.current.delete(event.nodeId);
        activeSinceRef.current.delete(event.nodeId);
        if (!mountedRef.current) return;
        setState((prev) => reduceStreamEvent(prev, event));
      }, remaining);
      pendingTimersRef.current.set(event.nodeId, timer);
      return;
    }

    setState((prev) => reduceStreamEvent(prev, event));
  }, []);

  const start = useCallback(
    (input: RunInput) => {
      for (const timer of pendingTimersRef.current.values()) {
        clearTimeout(timer);
      }
      pendingTimersRef.current.clear();
      activeSinceRef.current.clear();
      setState({ ...initialRunStreamState, status: "running" });

      void (async () => {
        let response: Response;
        try {
          response = await fetch("/api/runs/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input)
          });
        } catch (networkError) {
          if (!mountedRef.current) return;
          setState((prev) => ({
            ...prev,
            status: "error",
            error: networkError instanceof Error ? networkError.message : "Network request failed."
          }));
          return;
        }

        if (response.status === 400 || !response.ok) {
          let message = `Request failed with status ${response.status}.`;
          try {
            const body = (await response.json()) as { error?: string };
            if (body?.error) message = body.error;
          } catch {
            // ignore unparsable error body, keep default message
          }
          if (!mountedRef.current) return;
          setState((prev) => ({ ...prev, status: "error", error: message }));
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          if (!mountedRef.current) return;
          setState((prev) => ({ ...prev, status: "error", error: "Response stream unavailable." }));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let sawTerminalEvent = false;

        try {
          while (true) {
            if (!mountedRef.current) {
              await reader.cancel().catch(() => undefined);
              break;
            }
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = parseSseChunk(buffer);
            buffer = rest;
            for (const event of events) {
              if (event.type === "run-final" || event.type === "run-error") {
                sawTerminalEvent = true;
              }
              applyEvent(event);
            }
          }
        } catch (streamError) {
          if (!mountedRef.current) return;
          setState((prev) => ({
            ...prev,
            status: "error",
            error: streamError instanceof Error ? streamError.message : "Stream read failed."
          }));
          return;
        }

        if (!sawTerminalEvent && mountedRef.current) {
          setState((prev) => markStalledActiveNodesFailed(prev));
        }
      })();
    },
    [applyEvent]
  );

  return { ...state, start };
}

export type { RunStatus };
