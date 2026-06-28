import { describe, expect, it } from "vitest";
import { buildPytestFile, parsePytest } from "@/lib/execution/e2b";

describe("parsePytest", () => {
  it("parses an all-passed summary", () => {
    expect(parsePytest("3 passed in 0.01s", 3)).toEqual({ passed: 3, total: 3, resolved: true });
  });

  it("parses mixed failed and passed counts", () => {
    expect(parsePytest("1 failed, 2 passed in 0.02s", 3)).toEqual({ passed: 2, total: 3, resolved: false });
  });

  it("parses an error summary", () => {
    expect(parsePytest("1 error in 0.01s", 1)).toEqual({ passed: 0, total: 1, resolved: false });
  });

  it("falls back when no summary counts are present", () => {
    expect(parsePytest("", 4)).toEqual({ passed: 0, total: 4, resolved: false });
    expect(parsePytest("no pytest output here", 0)).toEqual({ passed: 0, total: 1, resolved: false });
  });

  it("parses a zero-passed summary", () => {
    expect(parsePytest("0 passed in 0.01s", 2)).toEqual({ passed: 0, total: 0, resolved: false });
  });
});

describe("buildPytestFile", () => {
  it("creates one test function per assert line", () => {
    const file = buildPytestFile("solution", "assert gcd(4, 2) == 2\nassert gcd(35, 21) == 7");

    expect(file).toContain("def test_case_0():");
    expect(file).toContain("    assert gcd(4, 2) == 2");
    expect(file).toContain("def test_case_1():");
    expect(file).toContain("    assert gcd(35, 21) == 7");
    expect(file.startsWith("from solution import *\n")).toBe(true);
  });

  it("places non-assert preamble lines at module level after the import", () => {
    const file = buildPytestFile("solution", "import math\nassert gcd(4, 2) == 2");

    const importIndex = file.indexOf("from solution import *");
    const mathIndex = file.indexOf("import math");
    const testIndex = file.indexOf("def test_case_0():");

    expect(importIndex).toBe(0);
    expect(mathIndex).toBeGreaterThan(importIndex);
    expect(testIndex).toBeGreaterThan(mathIndex);
    expect(file).not.toMatch(/def test_case_0\(\):\n\s+import math/);
  });
});
