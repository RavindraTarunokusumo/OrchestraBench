import Link from "next/link";
import { createDatasetAction } from "@/app/actions";
import { listDatasets } from "@/lib/store/file-store";

export default async function DatasetsPage() {
  const datasets = await listDatasets();

  return (
    <main className="container">
      <div className="page-title">
        <div>
          <h1>Benchmark datasets</h1>
          <p>Save known-bug tasks and rerun them across orchestration workflows.</p>
        </div>
      </div>

      <section className="grid two">
        <div className="panel stack">
          <h2>Saved tasks</h2>
          {datasets.map((task) => (
            <Link className="card" key={task.id} href={`/datasets/${task.id}`}>
              <strong>{task.title}</strong>
              <p className="muted">
                {task.language} · {task.knownBugs.length} known bug(s)
              </p>
            </Link>
          ))}
        </div>

        <form action={createDatasetAction} className="panel form-grid">
          <h2>Create task</h2>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required />
          </div>
          <div className="field">
            <label htmlFor="language">Language</label>
            <input id="language" name="language" required defaultValue="TypeScript" />
          </div>
          <div className="field">
            <label htmlFor="prompt">Prompt</label>
            <textarea id="prompt" name="prompt" required />
          </div>
          <div className="field">
            <label htmlFor="code">Code</label>
            <textarea id="code" name="code" required />
          </div>
          <div className="field">
            <label htmlFor="knownBugTitle">Known bug title</label>
            <input id="knownBugTitle" name="knownBugTitle" />
          </div>
          <div className="field">
            <label htmlFor="knownBugDescription">Known bug description</label>
            <textarea id="knownBugDescription" name="knownBugDescription" />
          </div>
          <div className="field">
            <label htmlFor="knownBugSeverity">Known bug severity</label>
            <select id="knownBugSeverity" name="knownBugSeverity" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tags">Tags</label>
            <input id="tags" name="tags" placeholder="auth, typescript" />
          </div>
          <button className="button primary" type="submit">
            Save dataset task
          </button>
        </form>
      </section>
    </main>
  );
}
