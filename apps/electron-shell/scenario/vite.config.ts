import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineConfig } from "vite";

const scenarioDir = import.meta.dirname;
const outDir = resolve(scenarioDir, "../dist-scenario");

/**
 * Builds the renderer scenario bundle. The output is a single IIFE file
 * because Chromium refuses ES module scripts on file:// origins; index.html
 * is copied verbatim next to it.
 */
export default defineConfig({
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2023",
    minify: false,
    lib: {
      entry: resolve(scenarioDir, "main.ts"),
      formats: ["iife"],
      name: "WenshuE2EScenario",
      fileName: () => "main.js",
    },
  },
  plugins: [
    {
      name: "wenshu-copy-scenario-html",
      closeBundle: () =>
        copyFile(resolve(scenarioDir, "index.html"), resolve(outDir, "index.html")),
    },
  ],
});
