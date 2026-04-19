import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
  resolve: {
    alias: {
      "@finlink/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
