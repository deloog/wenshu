import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineConfig } from "vite";

const scenarioDir = import.meta.dirname;
const outDir = resolve(scenarioDir, "../dist-workspace");

/**
 * Builds the A-03 workspace E2E bundle. The output is a single IIFE file
 * because Chromium refuses ES module scripts on file:// origins; index.html
 * is copied verbatim next to it. Loaded by electron-shell's e2e-main.cjs in
 * E2E_SCENARIO_MODE=workspace (product loading, not an import — the L3→web
 * layering ban stays intact).
 */
export default defineConfig({
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2023",
    minify: false,
    lib: {
      entry: resolve(scenarioDir, "workspace.ts"),
      formats: ["iife"],
      name: "WenshuWorkspaceScenario",
      fileName: () => "workspace.js",
    },
  },
  plugins: [
    {
      name: "wenshu-copy-workspace-html",
      closeBundle: () =>
        copyFile(resolve(scenarioDir, "index.html"), resolve(outDir, "index.html")),
    },
  ],
});
