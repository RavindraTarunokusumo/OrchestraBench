import { describe, expect, it } from "vitest";
import { extractCode } from "@/lib/workflows/extract-code";

describe("extractCode", () => {
  it("prefers a fenced python block", () => {
    const answer = "Here is the fix:\n```python\ndef gcd(a, b):\n    return b\n```\nDone.";
    expect(extractCode(answer)).toBe("def gcd(a, b):\n    return b");
  });

  it("falls back to a generic fenced block", () => {
    const answer = "```\nx = 1\n```";
    expect(extractCode(answer)).toBe("x = 1");
  });

  it("returns the trimmed whole answer when no fence is present", () => {
    expect(extractCode("  def f():\n    return 1  ")).toBe("def f():\n    return 1");
  });

  it("picks the largest block when multiple are present", () => {
    const answer = "```python\nx=1\n```\nthen\n```python\ndef big():\n    return 2\n```";
    expect(extractCode(answer)).toBe("def big():\n    return 2");
  });

  it("extracts code from a single-line fenced block", () => {
    const answer = "```python def f(): pass```";
    expect(extractCode(answer)).toBe("def f(): pass");
  });
});
