import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The suite shares one PostgreSQL database and truncates between cases.
    fileParallelism: false,
    setupFiles: ["./test/setup-env.ts"]
  }
});