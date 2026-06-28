import { describe, expect, it } from "vitest";
import { formatCostUsd, formatScore } from "@/lib/utils";

describe("formatCostUsd", () => {
  it("formats zero with four decimal places", () => {
    expect(formatCostUsd(0)).toBe("$0.0000");
  });

  it("rounds to four decimal places", () => {
    expect(formatCostUsd(0.12345)).toBe("$0.1235");
  });
});

describe("formatScore", () => {
  it("formats fractional scores to one decimal place", () => {
    expect(formatScore(0.75)).toBe("0.8");
  });

  it("formats whole numbers with one decimal place", () => {
    expect(formatScore(3)).toBe("3.0");
  });
});
