import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { quixbugsAdapter } from "@/lib/benchmarks/quixbugs";
import { upsertBenchmarkTask } from "@/lib/store/file-store";

const QUIXBUGS_REPO = "https://github.com/jkoppel/QuixBugs.git";
const QUIXBUGS_COMMIT = "a23e533a8b9019466e0e3220e2e3d4b9e4cf2e0d";
const RAW_DIR = path.join(process.cwd(), ".benchmarks", "quixbugs");
const SUBSET = [
  "gcd", "bitcount", "find_first_in_sorted", "hanoi", "is_valid_parenthesization",
  "levenshtein", "lis", "max_sublist_sum", "next_permutation", "shortest_path_length"
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
