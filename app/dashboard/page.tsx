import Link from "next/link";
import { workflowKinds, type WorkflowKind } from "@/lib/domain/types";
import { listRuns } from "@/lib/store/file-store";

export default async function DashboardPage() {
  const runs = await listRuns();
  const rows = workflowKinds.map((workflow) => summarize(workflow, runs.filter((run) => run.workflow === workflow)));

  return (
    <main className="container">
      <div className="page-title">
        <div>
          <h1>Comparison dashboard</h1>
          <p>Rank orchestration workflows by quality, cost, latency, and value score.</p>
        </div>
        <Link className="button primary" href="/runs/new">
          New run
        </Link>
      </div>

      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Workflow</th>
              <th>Runs</th>
              <th>Avg quality</th>
              <th>Avg value</th>
              <th>Avg cost</th>
              <th>Avg latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.workflow}>
                <td>{row.workflow}</td>
                <td>{row.count}</td>
                <td>{row.quality.toFixed(1)}</td>
                <td>{row.value.toFixed(1)}</td>
                <td>${row.cost.toFixed(4)}</td>
                <td>{Math.round(row.latency)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel stack" style={{ marginTop: 16 }}>
        <h2>Recent runs</h2>
        {runs.length === 0 ? <p className="muted">No runs yet.</p> : null}
        {runs.slice(0, 10).map((run) => (
          <Link className="card" key={run.id} href={`/runs/${run.id}`}>
            <strong>{run.title}</strong>
            <p className="muted">
              {run.workflow} · quality {run.evaluation.qualityScore.toFixed(1)} · value{" "}
              {run.evaluation.valueScore.toFixed(1)}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function summarize(workflow: WorkflowKind, runs: Awaited<ReturnType<typeof listRuns>>) {
  if (runs.length === 0) {
    return { workflow, count: 0, quality: 0, value: 0, cost: 0, latency: 0 };
  }

  return {
    workflow,
    count: runs.length,
    quality: avg(runs.map((run) => run.evaluation.qualityScore)),
    value: avg(runs.map((run) => run.evaluation.valueScore)),
    cost: avg(runs.map((run) => run.costUsd)),
    latency: avg(runs.map((run) => run.latencyMs))
  };
}

function avg(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
