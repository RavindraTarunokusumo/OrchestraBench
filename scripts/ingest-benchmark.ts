import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { quixbugsAdapter } from "@/lib/benchmarks/quixbugs";
import { upsertBenchmarkTask } from "@/lib/store/file-store";

const QUIXBUGS_REPO = "https://github.com/jkoppel/QuixBugs.git";
// Pinned to the jkoppel/QuixBugs master tip (verified reachable via `git ls-remote`).
const QUIXBUGS_COMMIT = "4257f44b0ff1181dedaedee6a447e133219fcebf";
const RAW_DIR = path.join(process.cwd(), ".benchmarks", "quixbugs");
const SUBSET = [
  "gcd", "bitcount", "find_first_in_sorted", "hanoi", "is_valid_parenthesization",
  "levenshtein", "lis", "max_sublist_sum", "next_permutation", "find_in_sorted"
];

async function main() {
  const all = process.argv.includes("--all");
  if (!existsSync(RAW_DIR)) {
    execFileSync("git", ["clone", "--depth", "1", QUIXBUGS_REPO, RAW_DIR], { stdio: "inherit" });
    execFileSync("git", ["-C", RAW_DIR, "fetch", "--depth", "1", "origin", QUIXBUGS_COMMIT], { stdio: "inherit" });
    execFileSync("git", ["-C", RAW_DIR, "checkout", QUIXBUGS_COMMIT], { stdio: "inherit" });
  }

  const tasks = await quixbugsAdapter.ingest(RAW_DIR);
  const selected = all ? tasks : tasks.filter((task) => SUBSET.includes(task.title));
  for (const task of selected) {
    await upsertBenchmarkTask(task);
  }
  console.log(`Ingested ${selected.length} QuixBugs task(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
