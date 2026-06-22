import { describe, expect, it } from "vitest";
import {
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
