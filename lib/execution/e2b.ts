import { Sandbox } from "@e2b/code-interpreter";
import type { ExecutionResult } from "@/lib/domain/types";
import type { ExecutorArgs, SandboxExecutor } from "@/lib/execution/executor";

function failed(message: string): ExecutionResult {
  return {
    resolved: false,
    testsPassed: 0,
    testsTotal: 0,
    exitCode: null,
    timedOut: false,
    stdout: "",
    stderr: message,
    durationMs: 0,
    backend: "e2b"
  };
}

/** Net change in open (){}[] brackets on a line — used to span multi-line asserts. */
function bracketDelta(line: string): number {
  let delta = 0;
  for (const char of line) {
    if (char === "(" || char === "[" || char === "{") delta += 1;
    else if (char === ")" || char === "]" || char === "}") delta -= 1;
  }
  return delta;
}

/**
 * Build a pytest file with one test function per `assert`, so pytest counts
 * asserts individually (enabling partial credit). A multi-line assert (one with
 * unbalanced brackets) keeps its continuation lines in the same function body;
 * other non-assert lines become shared module-level preamble after the import.
 */
export function buildPytestFile(moduleName: string, testCode: string): string {
  const preamble: string[] = [];
  const blocks: string[][] = [];
  let current: string[] | null = null;
  let depth = 0;

  for (const line of testCode.split("\n")) {
    if (current && depth > 0) {
      current.push(line);
      depth += bracketDelta(line);
      continue;
    }
    if (line.trim().startsWith("assert")) {
      current = [line];
      blocks.push(current);
      depth = bracketDelta(line);
    } else {
      current = null;
      depth = 0;
      preamble.push(line);
    }
  }

  const parts = [`from ${moduleName} import *`, ""];
  if (preamble.length > 0) {
    parts.push(...preamble, "");
  }

  blocks.forEach((block, index) => {
    parts.push(`def test_case_${index}():`);
    for (const line of block) {
      parts.push(`    ${line}`);
    }
    parts.push("");
  });

  return parts.join("\n");
}

/**
 * Parse pytest's final summary line into pass/total. `total` is floored to
 * `assertCount` (the number of test functions we generated) so collection
 * errors or a "0 passed" summary still report N tests, not 0 or 1.
 */
export function parsePytest(stdout: string, assertCount: number): { passed: number; total: number; resolved: boolean } {
  const lines = stdout.trim().split("\n").filter((line) => line.trim().length > 0);
  const summary = lines.length > 0 ? lines[lines.length - 1] : "";
  const passedMatch = summary.match(/(\d+)\s+passed/);
  const failedMatch = summary.match(/(\d+)\s+failed/);
  const errorMatch = summary.match(/(\d+)\s+errors?/i);

  if (!passedMatch && !failedMatch && !errorMatch) {
    return { passed: 0, total: assertCount, resolved: false };
  }

  const passed = passedMatch ? Number(passedMatch[1]) : 0;
  const failed = failedMatch ? Number(failedMatch[1]) : 0;
  const errors = errorMatch ? Number(errorMatch[1]) : 0;
  const total = Math.max(passed + failed + errors, assertCount);
  const resolved = failed === 0 && errors === 0 && passed > 0 && passed === total;
  return { passed, total, resolved };
}

export function createE2bExecutor(): SandboxExecutor {
  return {
    async run(args: ExecutorArgs): Promise<ExecutionResult> {
      if (!process.env.E2B_API_KEY) {
        return failed("E2B_API_KEY is not set.");
      }
      if (args.language !== "python") {
        return failed(`Unsupported language: ${args.language}`);
      }
      const assertCount = args.testCode.split("\n").filter((line) => line.trim().startsWith("assert")).length;
      const moduleName = args.entryPoint ?? "solution";
      const start = Date.now();
      let sandbox: Sandbox | undefined;
      try {
        sandbox = await Sandbox.create();
        await sandbox.files.write(`${moduleName}.py`, args.candidateCode);
        const testFile = buildPytestFile(moduleName, args.testCode);
        await sandbox.files.write("test_candidate.py", testFile);
        const run = await sandbox.commands.run("python -m pytest -q test_candidate.py", {
          timeoutMs: args.timeoutMs
        });
        const stdout = run.stdout ?? "";
        const stderr = run.stderr ?? "";
        const parsed = parsePytest(stdout, assertCount);
        return {
          resolved: parsed.resolved,
          testsPassed: parsed.passed,
          testsTotal: parsed.total,
          exitCode: run.exitCode ?? null,
          timedOut: false,
          stdout,
          stderr,
          durationMs: Date.now() - start,
          backend: "e2b"
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "E2B execution failed.";
        return { ...failed(message), durationMs: Date.now() - start, timedOut: /timeout/i.test(message) };
      } finally {
        await sandbox?.kill();
      }
    }
  };
}
