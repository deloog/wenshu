import { resolve } from "node:path";

import { resolveRuntimeConfig } from "@wenshu/config";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = resolve(import.meta.dirname, "../..");

export default defineConfig(({ mode }) => {
  const fileOverrides = loadEnv(mode, workspaceRoot, "WENSHU_");
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith("WENSHU_")),
  );

  resolveRuntimeConfig(mode, { ...fileOverrides, ...processOverrides });

  return {
    envDir: workspaceRoot,
  };
});
