"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchEvent } from "@/lib/benchmarks/batch-events";
import type { RunConfig } from "@/lib/domain/types";
import { parseSseChunk } from "@/lib/workflows/sse";

export type BenchmarkLogEntry = {
  id: string;
  message: string;
  tone?: "info" | "success" | "error";
};

export type BenchmarkStreamStatus = "idle" | "running" | "complete" | "error";

export type BenchmarkStreamState = {
  status: BenchmarkStreamStatus;
  batchId: string | null;
  taskIndex: number;
  taskTotal: number;
  benchmarkName: string | null;
  workflow: string | null;
  log: BenchmarkLogEntry[];
  finalSummary: {
    completed: number;
    failed: number;
    runIds: string[];
    aggregateResolvedRate: number;
  } | null;
  error: string | null;
};

const initialState: BenchmarkStreamState = {
  status: "idle",
  batchId: null,
  taskIndex: 0,
  taskTotal: 0,
  benchmarkName: null,
  workflow: null,
  log: [],
  finalSummary: null,
  error: null
};

let logCounter = 0;

function appendLog(
  prev: BenchmarkLogEntry[],
  message: string,
  tone: BenchmarkLogEntry["tone"] = "info"
): BenchmarkLogEntry[] {
  logCounter += 1;
  return [...prev, { id: `log-${logCounter}`, message, tone }];
}

function reduceBatchEvent(prev: BenchmarkStreamState, event: BatchEvent): BenchmarkStreamState {
  switch (event.type) {
    case "benchmark-start":
      return {
        ...prev,
        status: "running",
        batchId: event.batchId,
        taskIndex: 0,
        taskTotal: event.taskTotal,
        benchmarkName: event.name,
        workflow: event.workflow,
        log: appendLog(
          prev.log,
          `Starting ${event.name} (${event.taskTotal} task${event.taskTotal === 1 ? "" : "s"}) with ${event.workflow}…`
        ),
        finalSummary: null,
        error: null
      };
    case "task-start":
      return {
        ...prev,
        taskIndex: event.taskIndex,
        taskTotal: event.taskTotal,
        log: appendLog(
          prev.log,
          `Running ${event.taskTitle} (${event.taskIndex + 1}/${event.taskTotal})…`
        )
      };
    case "task-final":
      return {
        ...prev,
        taskIndex: event.taskIndex + 1,
        log: appendLog(
          prev.log,
          `${event.taskId} ${event.resolved ? "resolved ✓" : "unresolved ✗"} · ${event.costUsd.toFixed(4)} USD · ${event.latencyMs} ms`,
          event.resolved ? "success" : "info"
        )
      };
    case "task-error":
      return {
        ...prev,
        taskIndex: event.taskIndex + 1,
        log: appendLog(prev.log, `Task ${event.taskId} failed: ${event.error}`, "error")
      };
    case "benchmark-final":
      return {
        ...prev,
        status: "complete",
        taskIndex: event.completed + event.failed,
        finalSummary: {
          completed: event.completed,
          failed: event.failed,
          runIds: event.runIds,
          aggregateResolvedRate: event.aggregateResolvedRate
        },
        log: appendLog(
          prev.log,
          `Benchmark complete — ${event.completed} succeeded, ${event.failed} failed · ${(event.aggregateResolvedRate * 100).toFixed(0)}% resolved`,
          "success"
        )
      };
    case "run-error":
      return {
        ...prev,
        status: "error",
        error: event.message,
        log: appendLog(prev.log, event.message, "error")
      };
    default:
      return prev;
  }
}

export type UseBenchmarkStreamResult = BenchmarkStreamState & {
  start: (slug: string, config: RunConfig) => void;
  reset: () => void;
};

export function useBenchmarkStream(): UseBenchmarkStreamResult {
  const [state, setState] = useState<BenchmarkStreamState>(initialState);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const start = useCallback((slug: string, config: RunConfig) => {
    setState({ ...initialState, status: "running" });

    void (async () => {
      let response: Response;
      try {
        response = await fetch(`/api/benchmarks/${slug}/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config)
        });
      } catch (networkError) {
        if (!mountedRef.current) return;
        const message = networkError instanceof Error ? networkError.message : "Network request failed.";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          log: appendLog(prev.log, message, "error")
        }));
        return;
      }

      if (!response.ok) {
        let message = `Request failed with status ${response.status}.`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // ignore unparsable error body
        }
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          log: appendLog(prev.log, message, "error")
        }));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        if (!mountedRef.current) return;
        const message = "Response stream unavailable.";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          log: appendLog(prev.log, message, "error")
        }));
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
          for (const rawEvent of events) {
            const event = rawEvent as unknown as BatchEvent;
            if (event.type === "benchmark-final" || event.type === "run-error") {
              sawTerminalEvent = true;
            }
            if (!mountedRef.current) return;
            setState((prev) => reduceBatchEvent(prev, event));
          }
        }
      } catch (streamError) {
        if (!mountedRef.current) return;
        const message = streamError instanceof Error ? streamError.message : "Stream read failed.";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          log: appendLog(prev.log, message, "error")
        }));
        return;
      }

      if (!sawTerminalEvent && mountedRef.current) {
        const message = "Benchmark stream ended without a final event.";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          log: appendLog(prev.log, message, "error")
        }));
      }
    })();
  }, []);

  return { ...state, start, reset };
}
