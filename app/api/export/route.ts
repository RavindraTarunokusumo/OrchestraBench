import { exportData } from "@/lib/store/file-store";

export async function GET() {
  const data = await exportData();
  return Response.json(data, {
    headers: {
      "Content-Disposition": 'attachment; filename="orchestrabench-export.json"'
    }
  });
}
