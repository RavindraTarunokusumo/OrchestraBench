import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/data-dir.ts"],
    // Per-worker ORCHESTRABENCH_DATA_DIR (set in setup) isolates each worker's
    // file-store, so cross-file parallelism is safe.
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname
    }
  }
});
