import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BenchmarkTask } from "@/lib/domain/types";
import type { BenchmarkAdapter } from "@/lib/benchmarks/adapter";

const PROMPT =
  "Fix the bug in this function so all tests pass. Return only the corrected code in a single code block.";
const EPOCH = "1970-01-01T00:00:00.000Z";

async function readProgram(dir: string, name: string): Promise<string> {
  return (await readFile(path.join(dir, name), "utf8")).trimEnd();
}

function buildTestCode(entryPoint: string, casesJsonl: string): string {
  const lines = casesJsonl
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const asserts = lines.map((line) => {
    const [inputs, expected] = JSON.parse(line) as [unknown[], unknown];
    const args = inputs.map((value) => JSON.stringify(value)).join(", ");
    return `assert ${entryPoint}(${args}) == ${JSON.stringify(expected)}`;
  });
  return asserts.join("\n");
}

export const quixbugsAdapter: BenchmarkAdapter = {
  source: "quixbugs",
  async ingest(rawDir: string): Promise<BenchmarkTask[]> {
    const buggyDir = path.join(rawDir, "python_programs");
    const correctDir = path.join(rawDir, "correct_python_programs");
    const casesDir = path.join(rawDir, "json_testcases");

    const files = (await readdir(buggyDir)).filter((file) => file.endsWith(".py")).sort();
    const tasks: BenchmarkTask[] = [];

    for (const file of files) {
      const name = file.replace(/\.py$/, "");
      let casesJsonl: string;
      try {
        casesJsonl = await readFile(path.join(casesDir, `${name}.json`), "utf8");
      } catch {
        continue; // skip programs without testcases
      }
      tasks.push({
        id: `quixbugs_${name}`,
        title: name,
        language: "python",
        prompt: PROMPT,
        code: await readProgram(buggyDir, file),
        referenceFix: await readProgram(correctDir, file),
        testCode: buildTestCode(name, casesJsonl),
        entryPoint: name,
        source: "quixbugs",
        tags: ["quixbugs", "python"],
        createdAt: EPOCH,
        updatedAt: EPOCH
      });
    }
    return tasks;
  }
};
