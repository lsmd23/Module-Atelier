import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every suite shares one PostgreSQL database and truncates between cases,
    // so test files must not run in parallel.
    fileParallelism: false,
    setupFiles: ["./test/setup-env.ts"]
  }
});