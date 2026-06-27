import { describe, expect, it } from "vitest";
import { createE2bExecutor } from "@/lib/execution/e2b";

const runIf = process.env.E2B_API_KEY ? it : it.skip;

describe("createE2bExecutor", () => {
  runIf("resolves a correct python fix against passing tests", async () => {
    const executor = createE2bExecutor();
    const result = await executor.run({
      language: "python",
      candidateCode: "def gcd(a, b):\n    return a if b == 0 else gcd(b, a % b)",
      testCode: "assert gcd(35, 21) == 7\nassert gcd(7, 49) == 7",
      entryPoint: "gcd",
      timeoutMs: 30000
    });
    expect(result.backend).toBe("e2b");
    expect(result.resolved).toBe(true);
    expect(result.testsTotal).toBeGreaterThan(0);
  }, 60000);
});
