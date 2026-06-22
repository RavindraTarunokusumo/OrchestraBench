import { getDataset } from "@/lib/store/file-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const dataset = await getDataset(id);
  if (!dataset) {
    return Response.json({ error: "Dataset task not found." }, { status: 404 });
  }

  return Response.json({ dataset });
}
