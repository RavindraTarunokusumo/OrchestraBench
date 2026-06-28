import { describe, expect, it } from "vitest";
import { extractMockCandidate } from "@/lib/providers/mock-provider";

describe("extractMockCandidate", () => {
  it("returns the code after the first 'Buggy code:' label, even if the code repeats it", () => {
    const prompt = "Role: x\nBuggy code:\ndef f():\n    # Buggy code: noise\n    return 1";
    expect(extractMockCandidate(prompt)).toBe("def f():\n    # Buggy code: noise\n    return 1");
  });

  it("reuses the largest fenced block when there is no marker", () => {
    const prompt = "Merge these:\n```python\nsmall\n```\n```python\nmuch larger candidate body\n```";
    expect(extractMockCandidate(prompt)).toBe("much larger candidate body");
  });

  it("falls back to a stub when there is no marker or fence", () => {
    expect(extractMockCandidate("Plan a review of the code.")).toBe("# mock candidate\npass");
  });
});
