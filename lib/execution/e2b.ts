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

export function buildPytestFile(moduleName: string, testCode: string): string {
  const lines = testCode.split("\n");
  const preamble: string[] = [];
  const asserts: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith("assert")) {
      asserts.push(line);
    } else {
      preamble.push(line);
    }
  }

  const parts = [`from ${moduleName} import *`, ""];
  if (preamble.length > 0) {
    parts.push(...preamble, "");
  }

  for (let i = 0; i < asserts.length; i++) {
    parts.push(`def test_case_${i}():`, `    ${asserts[i]}`, "");
  }

  return parts.join("\n");
}

export function parsePytest(stdout: string, assertCount: number): { passed: number; total: number; resolved: boolean } {
  const passedMatch = stdout.match(/(\d+)\s+passed/);
  const failedMatch = stdout.match(/(\d+)\s+failed/);
  const errorMatch = stdout.match(/(\d+)\s+errors?/i);

  const passed = passedMatch ? Number(passedMatch[1]) : 0;
  const failed = failedMatch ? Number(failedMatch[1]) : 0;
  const errors = errorMatch ? Number(errorMatch[1]) : 0;

  const hasCounts = passedMatch !== null || failedMatch !== null || errorMatch !== null;
  if (!hasCounts) {
    const total = Math.max(assertCount, 1);
    return { passed: 0, total, resolved: false };
  }

  const total = passed + failed + errors;
  const resolved = failed === 0 && errors === 0 && passed > 0;
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
