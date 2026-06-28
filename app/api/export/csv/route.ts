import { runsToCsv } from "@/lib/export/runs-csv";
import { listRuns } from "@/lib/store/file-store";

export async function GET() {
  const runs = await listRuns();
  const csv = runsToCsv(runs);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orchestrabench-runs.csv"'
    }
  });
}
