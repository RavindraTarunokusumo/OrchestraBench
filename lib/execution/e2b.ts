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

/** Parse pytest's summary into passed/total. Each `assert` line is one logical test. */
function parsePytest(stdout: string, assertCount: number): { passed: number; total: number; resolved: boolean } {
  const total = Math.max(assertCount, 1);
  if (/\bpassed\b/.test(stdout) && !/\bfailed\b/.test(stdout) && !/\berror\b/i.test(stdout)) {
    return { passed: total, total, resolved: true };
  }
  return { passed: 0, total, resolved: false };
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
        const testFile = `from ${moduleName} import *\n\ndef test_candidate():\n${args.testCode
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n")}\n`;
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
