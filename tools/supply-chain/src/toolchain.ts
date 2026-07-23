import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SupplyChainError } from "./errors.ts";
import type { SupplyChainSbom } from "./types.ts";

// npm-consumed toolchain pins: toolchain record key -> sbom package name.
// electron and devecoStudio are record-only (not installed via npm); if they
// ever become npm dependencies they must be added here first.
const TOOLCHAIN_PIN_MAP: ReadonlyMap<string, string> = new Map([
  ["typescript", "typescript"],
  ["eslint", "eslint"],
  ["eslintJs", "@eslint/js"],
  ["typescriptEslint", "typescript-eslint"],
  ["prettier", "prettier"],
  ["vite", "vite"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new SupplyChainError("TOOLCHAIN_DRIFT", "toolchain record cannot be read");
  }
  if (!isRecord(parsed)) {
    throw new SupplyChainError("TOOLCHAIN_DRIFT", "toolchain record is invalid");
  }
  return parsed;
}

function pinnedVersion(toolchain: Record<string, unknown>, key: string): string {
  const entry = toolchain[key];
  if (!isRecord(entry) || typeof entry["version"] !== "string") {
    throw new SupplyChainError(
      "TOOLCHAIN_DRIFT",
      "toolchain record is missing a pinned version",
    );
  }
  return entry["version"];
}

export async function checkToolchainPins(
  workspaceRoot: string,
  sbom: SupplyChainSbom,
): Promise<readonly string[]> {
  const toolchain = await readJson(join(workspaceRoot, "toolchain.versions.json"));
  const rootManifest = await readJson(join(workspaceRoot, "package.json"));
  const mismatches: string[] = [];

  const engines = isRecord(rootManifest["engines"]) ? rootManifest["engines"] : {};
  if (engines["node"] !== pinnedVersion(toolchain, "node")) {
    mismatches.push("node");
  }
  const packageManager = rootManifest["packageManager"];
  if (packageManager !== `pnpm@${pinnedVersion(toolchain, "pnpm")}`) {
    mismatches.push("pnpm");
  }
  for (const [key, packageName] of TOOLCHAIN_PIN_MAP) {
    const pinned = pinnedVersion(toolchain, key);
    const installed = sbom.packages.find(
      (entry) => entry.name === packageName && entry.direct,
    );
    if (installed === undefined || installed.version !== pinned) {
      mismatches.push(packageName);
    }
  }
  if (mismatches.length > 0) {
    throw new SupplyChainError(
      "TOOLCHAIN_DRIFT",
      `toolchain pins disagree with the dependency tree: ${mismatches.join(", ")}`,
    );
  }
  return Object.freeze(["node", "pnpm", ...TOOLCHAIN_PIN_MAP.values()]);
}
