import { createRunAction } from "@/app/actions";
import { workflowKinds } from "@/lib/domain/types";

const labels: Record<(typeof workflowKinds)[number], string> = {
  single_cheap: "Single Cheap Model",
  single_strong: "Single Strong Model",
  panel_judge: "Panel + Judge",
  cheap_first: "Cheap-First Escalation",
  planner_worker_verifier: "Planner -> Worker -> Verifier"
};

export default function NewRunPage() {
  return (
    <main className="container">
      <div className="page-title">
        <div>
          <h1>New code review run</h1>
          <p>Submit code once, then compare orchestration workflows by findings, cost, and latency.</p>
        </div>
      </div>

      <form action={createRunAction} className="grid two">
        <section className="panel form-grid">
          <div className="field">
            <label htmlFor="title">Task title</label>
            <input id="title" name="title" required defaultValue="Review auth helper" />
          </div>
          <div className="field">
            <label htmlFor="prompt">Review instructions</label>
            <textarea
              id="prompt"
              name="prompt"
              required
              defaultValue="Find correctness, security, and edge-case bugs. Return concrete findings with severity and fixes."
            />
          </div>
          <div className="field">
            <label htmlFor="code">Code or context</label>
            <textarea
              id="code"
              name="code"
              required
              defaultValue={"function canDelete(user?: { role: string }) {\n  return user!.role === 'admin';\n}"}
            />
          </div>
        </section>

        <aside className="panel form-grid">
          <div className="field">
            <label htmlFor="language">Language</label>
            <input id="language" name="language" required defaultValue="TypeScript" />
          </div>
          <div className="field">
            <label htmlFor="workflow">Workflow</label>
            <select id="workflow" name="workflow" defaultValue="cheap_first">
              {workflowKinds.map((workflow) => (
                <option key={workflow} value={workflow}>
                  {labels[workflow]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="costLimitUsd">Cost limit USD</label>
            <input id="costLimitUsd" name="costLimitUsd" type="number" step="0.0001" min="0.0001" placeholder="0.02" />
          </div>
          <button className="button primary" type="submit">
            Run benchmark
          </button>
          <p className="muted">
            Without `OPENROUTER_API_KEY`, runs use the deterministic mock provider. With credentials, the default
            OpenRouter model is `cohere/north-mini-code:free`.
          </p>
        </aside>
      </form>
    </main>
  );
}
