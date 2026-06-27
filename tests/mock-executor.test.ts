import { describe, expect, it } from "vitest";
import { createMockExecutor } from "@/lib/execution/mock-executor";

describe("createMockExecutor", () => {
  it("returns the scripted result", async () => {
    const executor = createMockExecutor({ resolved: true, testsPassed: 3, testsTotal: 3 });
    const result = await executor.run({
      language: "python",
      candidateCode: "def f(): return 1",
      testCode: "assert f() == 1",
      timeoutMs: 1000
    });
    expect(result.resolved).toBe(true);
    expect(result.testsPassed).toBe(3);
    expect(result.backend).toBe("mock");
  });

  it("defaults to an unresolved zero-test result", async () => {
    const executor = createMockExecutor({});
    const result = await executor.run({
      language: "python",
      candidateCode: "",
      testCode: "",
      timeoutMs: 1000
    });
    expect(result.resolved).toBe(false);
    expect(result.testsTotal).toBe(0);
  });
});
