import { notFound, redirect } from "next/navigation";
import { benchmarkSlugForSource } from "@/lib/benchmarks/catalog";
import { getDataset } from "@/lib/store/file-store";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DatasetDetailRedirectPage({ params }: PageProps) {
  const { id } = await params;
  const task = await getDataset(id);

  if (!task) {
    notFound();
  }

  const slug = benchmarkSlugForSource(task.source);
  redirect(`/benchmarks/${slug}?task=${task.id}`);
}
