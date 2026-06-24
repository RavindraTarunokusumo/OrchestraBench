import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The file-store persists to a single shared JSON file via a temp-file rename.
    // Running test files in parallel lets two workers race that rename (EPERM on
    // Windows). The suite is small, so disable cross-file parallelism for determinism.
    fileParallelism: false
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname
    }
  }
});
