import { describe, expect, it } from "vitest";
import {
  benchmarkRunSchema,
  createRunSchema,
  formatZodErrors,
  parseDatasetCreateRequest,
  parseDatasetRerunRequest,
  parseRunCreateRequest
} from "@/lib/api/contracts";

describe("API request parsers", () => {
  it("normalizes a create-run request", () => {
    expect(
      parseRunCreateRequest({
        title: "Review auth helper",
        language: "TypeScript",
        prompt: "Find bugs.",
        code: "export const ok = true;",
        workflow: "single_cheap",
        costLimitUsd: 0.05,
        benchmarkTaskId: "task_1"
      })
    ).toMatchObject({
      title: "Review auth helper",
      language: "TypeScript",
      workflow: "single_cheap",
      costLimitUsd: 0.05,
      benchmarkTaskId: "task_1"
    });
  });

  it("treats blank optional numeric fields as omitted", () => {
    expect(
      parseRunCreateRequest({
        title: "Review auth helper",
        language: "TypeScript",
        prompt: "Find bugs.",
        code: "export const ok = true;",
        workflow: "single_cheap",
        benchmarkTaskId: "task_1",
        costLimitUsd: ""
      }).costLimitUsd
    ).toBeUndefined();

    expect(parseDatasetRerunRequest({ costLimitUsd: "" })).toEqual({
      workflows: [
        "single_cheap",
        "single_strong",
        "panel_judge",
        "cheap_first",
        "planner_worker_verifier"
      ]
    });
  });

  it("rejects invalid workflow values for create-run", () => {
    expect(() =>
      parseRunCreateRequest({
        title: "Review auth helper",
        language: "TypeScript",
        prompt: "Find bugs.",
        code: "export const ok = true;",
        workflow: "unknown"
      })
    ).toThrow();
  });

  it("normalizes a create-dataset request", () => {
    expect(
      parseDatasetCreateRequest({
        title: "Auth task",
        language: "TypeScript",
        prompt: "Find auth bugs.",
        code: "function auth() {}",
        knownBugTitle: "Null user",
        knownBugDescription: "Crashes before authorization.",
        knownBugSeverity: "high",
        tags: ["auth", "seed"]
      })
    ).toEqual({
      title: "Auth task",
      language: "TypeScript",
      prompt: "Find auth bugs.",
      code: "function auth() {}",
      knownBugTitle: "Null user",
      knownBugDescription: "Crashes before authorization.",
      knownBugSeverity: "high",
      tags: ["auth", "seed"]
    });
  });

  it("defaults rerun requests to all workflows", () => {
    expect(parseDatasetRerunRequest({})).toEqual({
      workflows: [
        "single_cheap",
        "single_strong",
        "panel_judge",
        "cheap_first",
        "planner_worker_verifier"
      ]
    });
  });
});

describe("createRunSchema repair fields", () => {
  const repairBase = {
    title: "gcd",
    language: "python",
    prompt: "Fix the bug.",
    code: "def gcd(a, b): return a",
    workflow: "single_cheap" as const
  };

  it("accepts testCode and entryPoint", () => {
    const input = parseRunCreateRequest({
      ...repairBase,
      testCode: "assert gcd(4, 2) == 2",
      entryPoint: "gcd"
    });
    expect(input.testCode).toBe("assert gcd(4, 2) == 2");
    expect(input.entryPoint).toBe("gcd");
  });

  it("accepts a benchmarkTaskId without testCode", () => {
    const input = parseRunCreateRequest({ ...repairBase, benchmarkTaskId: "task_1" });
    expect(input.benchmarkTaskId).toBe("task_1");
  });

  it("rejects a run with neither testCode nor benchmarkTaskId", () => {
    expect(() => parseRunCreateRequest(repairBase)).toThrow();
  });

  it("rejects an entryPoint that is not a Python identifier", () => {
    expect(() =>
      parseRunCreateRequest({
        ...repairBase,
        testCode: "assert gcd(4, 2) == 2",
        entryPoint: "import os; os.system('x')"
      })
    ).toThrow();
    expect(() =>
      parseRunCreateRequest({ ...repairBase, testCode: "assert gcd(4, 2) == 2", entryPoint: "1bad" })
    ).toThrow();
  });

  it("rejects an entryPoint that is a Python reserved keyword", () => {
    for (const keyword of ["class", "import", "from", "def"]) {
      expect(() =>
        parseRunCreateRequest({ ...repairBase, testCode: "assert gcd(4, 2) == 2", entryPoint: keyword })
      ).toThrow();
    }
  });

  it("reports a clear top-level message when testCode and benchmarkTaskId are both missing", () => {
    const result = createRunSchema.safeParse(repairBase);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodErrors(result.error)).toContain(
        "Provide testCode or a benchmarkTaskId to evaluate the repair."
      );
    }
  });

  it("accepts optional run configuration fields", () => {
    const input = parseRunCreateRequest({
      ...repairBase,
      testCode: "assert gcd(4, 2) == 2",
      maxOutputTokens: 512,
      cheapModel: "custom/cheap-model",
      strongModel: "custom/strong-model"
    });
    expect(input.maxOutputTokens).toBe(512);
    expect(input.cheapModel).toBe("custom/cheap-model");
    expect(input.strongModel).toBe("custom/strong-model");
  });

  it("rejects invalid maxOutputTokens values", () => {
    expect(() =>
      parseRunCreateRequest({
        ...repairBase,
        testCode: "assert gcd(4, 2) == 2",
        maxOutputTokens: 0
      })
    ).toThrow();
    expect(() =>
      parseRunCreateRequest({
        ...repairBase,
        testCode: "assert gcd(4, 2) == 2",
        maxOutputTokens: 1.5
      })
    ).toThrow();
  });
});

describe("benchmarkRunSchema", () => {
  it("accepts a minimal benchmark run configuration", () => {
    expect(benchmarkRunSchema.parse({ workflow: "cheap_first" })).toEqual({
      workflow: "cheap_first"
    });
  });

  it("accepts optional model and token fields", () => {
    expect(
      benchmarkRunSchema.parse({
        workflow: "panel_judge",
        costLimitUsd: 0.25,
        maxOutputTokens: 1024,
        cheapModel: "custom/cheap",
        strongModel: "custom/strong"
      })
    ).toEqual({
      workflow: "panel_judge",
      costLimitUsd: 0.25,
      maxOutputTokens: 1024,
      cheapModel: "custom/cheap",
      strongModel: "custom/strong"
    });
  });

  it("rejects empty model strings", () => {
    expect(() =>
      benchmarkRunSchema.parse({
        workflow: "single_cheap",
        cheapModel: "   "
      })
    ).toThrow();
  });
});
