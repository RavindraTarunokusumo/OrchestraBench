import path from "node:path";
import { describe, expect, it } from "vitest";
import { quixbugsAdapter } from "@/lib/benchmarks/quixbugs";

const RAW_DIR = path.join(process.cwd(), "tests", "fixtures", "quixbugs");

describe("quixbugsAdapter", () => {
  it("normalizes a program into a benchmark task", async () => {
    const tasks = await quixbugsAdapter.ingest(RAW_DIR);
    const gcd = tasks.find((task) => task.id === "quixbugs_gcd");
    expect(gcd).toBeDefined();
    expect(gcd?.source).toBe("quixbugs");
    expect(gcd?.language).toBe("python");
    expect(gcd?.entryPoint).toBe("gcd");
    expect(gcd?.code).toContain("gcd(a % b, b)");        // buggy
    expect(gcd?.referenceFix).toContain("gcd(b, a % b)"); // gold
    expect(gcd?.testCode).toContain("gcd(35, 21)");
    expect(gcd?.testCode).toContain("== 7");
  });

  it("is deterministic across runs", async () => {
    const first = await quixbugsAdapter.ingest(RAW_DIR);
    const second = await quixbugsAdapter.ingest(RAW_DIR);
    expect(first).toEqual(second);
  });
});
