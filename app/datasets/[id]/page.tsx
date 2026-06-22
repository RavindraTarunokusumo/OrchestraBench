import Link from "next/link";
import { notFound } from "next/navigation";
import { rerunDatasetAction } from "@/app/actions";
import { workflowKinds } from "@/lib/domain/types";
import { getDataset, listRuns } from "@/lib/store/file-store";

export default async function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getDataset(id);
  if (!task) {
    notFound();
  }
  const relatedRuns = (await listRuns()).filter((run) => run.benchmarkTaskId === task.id);

  return (
    <main className="container">
      <div className="page-title">
        <div>
          <h1>{task.title}</h1>
          <p>
            {task.language} · {task.tags.join(", ") || "untagged"}
          </p>
        </div>
        <Link className="button" href="/datasets">
          Back to datasets
        </Link>
      </div>

      <section className="grid two">
        <article className="panel stack">
          <h2>Task</h2>
          <p>{task.prompt}</p>
          <pre className="code">{task.code}</pre>
          <h2>Known bugs</h2>
          {task.knownBugs.map((bug) => (
            <div className="card" key={bug.id}>
              <strong>{bug.title}</strong>
              <p className="muted">
                {bug.severity} · {bug.description}
              </p>
            </div>
          ))}
        </article>

        <aside className="panel stack">
          <h2>Rerun workflows</h2>
          <form action={rerunDatasetAction} className="form-grid">
            <input type="hidden" name="taskId" value={task.id} />
            <div className="checkbox-grid">
              {workflowKinds.map((workflow) => (
                <label className="checkbox" key={workflow}>
                  <input type="checkbox" name="workflows" value={workflow} defaultChecked />
                  <span>{workflow}</span>
                </label>
              ))}
            </div>
            <div className="field">
              <label htmlFor="costLimitUsd">Cost limit USD</label>
              <input id="costLimitUsd" name="costLimitUsd" type="number" step="0.0001" min="0" />
            </div>
            <button className="button primary" type="submit">
              Rerun selected
            </button>
          </form>

          <h2>Related runs</h2>
          {relatedRuns.length === 0 ? <p className="muted">No reruns yet.</p> : null}
          {relatedRuns.map((run) => (
            <Link className="card" key={run.id} href={`/runs/${run.id}`}>
              <strong>{run.workflow}</strong>
              <p className="muted">Value {run.evaluation.valueScore.toFixed(1)}</p>
            </Link>
          ))}
        </aside>
      </section>
    </main>
  );
}
