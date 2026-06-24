import { NewRunClient } from "@/app/runs/new/new-run-client";

export default function NewRunPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New code review run</h1>
        <p className="text-muted-foreground">
          Submit code once, then compare orchestration workflows by findings, cost, and latency.
        </p>
      </div>
      <NewRunClient />
    </main>
  );
}
