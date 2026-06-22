import Link from "next/link";
import { notFound } from "next/navigation";
import { feedbackAction } from "@/app/actions";
import { getRun } from "@/lib/store/file-store";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) {
    notFound();
  }

  return (
    <main className="container">
      <div className="page-title">
        <div>
          <h1>{run.title}</h1>
          <p>
            {run.workflow} · {run.providerLabel} · {run.status}
          </p>
        </div>
        <Link className="button" href="/dashboard">
          Compare workflows
        </Link>
      </div>

      <section className="grid three">
        <Metric label="Quality" value={run.evaluation.qualityScore.toFixed(1)} />
        <Metric label="Value" value={run.evaluation.valueScore.toFixed(1)} />
        <Metric label="Cost" value={`$${run.costUsd.toFixed(4)}`} />
      </section>

      <section className="grid two" style={{ marginTop: 16 }}>
        <article className="panel stack">
          <div>
            <span className={run.escalated ? "badge warning" : "badge"}>
              {run.escalated ? "Escalated" : "No escalation"}
            </span>
            {run.escalationReason ? <p className="muted">{run.escalationReason}</p> : null}
          </div>
          <h2>Final answer</h2>
          <p>{run.finalAnswer}</p>
          <h2>Findings</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Finding</th>
                <th>Severity</th>
                <th>Confidence</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {run.findings.map((finding) => (
                <tr key={finding.id}>
                  <td>
                    <strong>{finding.title}</strong>
                    <br />
                    <span className="muted">{finding.description}</span>
                  </td>
                  <td>{finding.severity}</td>
                  <td>{Math.round(finding.confidence * 100)}%</td>
                  <td>{finding.sourceRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <aside className="panel stack">
          <h2>Evaluation</h2>
          <div className="metric-row">
            <Metric label="TP" value={run.evaluation.truePositives} />
            <Metric label="FP" value={run.evaluation.falsePositives} />
            <Metric label="Missed" value={run.evaluation.missedKnownBugs} />
            <Metric label="Judge" value={`${Math.round(run.evaluation.judgeConfidence * 100)}%`} />
          </div>
          <form action={feedbackAction} className="form-grid">
            <input type="hidden" name="runId" value={run.id} />
            <div className="field">
              <label htmlFor="userRating">Human rating</label>
              <select id="userRating" name="userRating" defaultValue={run.evaluation.userRating ?? ""}>
                <option value="">No rating</option>
                <option value="1">1 - poor</option>
                <option value="2">2</option>
                <option value="3">3 - useful</option>
                <option value="4">4</option>
                <option value="5">5 - excellent</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="notes">Feedback notes</label>
              <textarea id="notes" name="notes" defaultValue={run.evaluation.notes ?? ""} />
            </div>
            <button className="button primary" type="submit">
              Save feedback
            </button>
          </form>
        </aside>
      </section>

      <section className="panel stack" style={{ marginTop: 16 }}>
        <h2>Model-call trace</h2>
        {run.calls.map((call) => (
          <article className="card stack" key={call.id}>
            <div className="trace-row">
              <strong>{call.role}</strong>
              <span>{call.model}</span>
              <span>${call.estimatedCostUsd.toFixed(4)}</span>
              <span>{call.latencyMs} ms</span>
            </div>
            <pre className="code">{call.response}</pre>
          </article>
        ))}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
