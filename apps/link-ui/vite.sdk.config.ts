import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Separate build for the embed SDK (finlink.js).
 * Generates: dist/sdk/finlink.js (UMD) + dist/sdk/finlink.mjs (ESM).
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist/sdk",
    lib: {
      entry: resolve(__dirname, "src/sdk/finlink.ts"),
      name: "FinLink",
      fileName: (format) => (format === "es" ? "finlink.mjs" : "finlink.js"),
      formats: ["umd", "es"],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
});
