import { describe, expect, it } from "vitest";
import { createDatasetTask, getDataset, listDatasets } from "@/lib/store/file-store";

describe("file-store data dir", () => {
  it("round-trips a dataset task through the configured store", async () => {
    const created = await createDatasetTask({
      title: "Test task",
      language: "TypeScript",
      prompt: "Find bugs.",
      code: "export const ok = true;"
    });

    const fetched = await getDataset(created.id);
    expect(fetched).toMatchObject({
      id: created.id,
      title: "Test task",
      language: "TypeScript",
      prompt: "Find bugs.",
      code: "export const ok = true;"
    });

    const datasets = await listDatasets();
    expect(datasets.some((d) => d.id === created.id)).toBe(true);
  });
});
