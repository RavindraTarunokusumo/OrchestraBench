import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next does not infer a parent
  // directory when multiple lockfiles exist (e.g. git worktrees nested in the repo).
  outputFileTracingRoot: path.resolve()
};

export default nextConfig;
