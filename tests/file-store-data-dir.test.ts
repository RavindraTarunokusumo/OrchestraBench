import { existsSync } from "node:fs";
import path from "node:path";
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

  it("persists to the ORCHESTRABENCH_DATA_DIR override, not the default .data", async () => {
    const dataDir = process.env.ORCHESTRABENCH_DATA_DIR;
    expect(dataDir).toBeTruthy();
    await createDatasetTask({ title: "Dir check", language: "python", prompt: "x", code: "y" });
    expect(existsSync(path.join(dataDir!, "orchestrabench.json"))).toBe(true);
  });
});
