import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./test/global-setup.ts",
    env: { DATABASE_URL: "file:./test.db" },
    fileParallelism: false,
  },
});
