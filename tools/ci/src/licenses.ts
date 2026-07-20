import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface DependencyLocation {
  readonly name: string;
  readonly path: string;
  readonly version: string;
}

const RECOGNIZED_LICENSE_EXPRESSIONS = new Set([
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "MPL-2.0",
  "OFL-1.1",
  "Python-2.0",
]);

async function packageDirectories(nodeModulesPath: string): Promise<readonly string[]> {
  const entries = await readdir(nodeModulesPath, { withFileTypes: true });
  const directories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin") {
      continue;
    }
    const entryPath = join(nodeModulesPath, entry.name);
    if (!entry.name.startsWith("@")) {
      directories.push(entryPath);
      continue;
    }
    const scopedEntries = await readdir(entryPath, { withFileTypes: true });
    for (const scopedEntry of scopedEntries) {
      if (scopedEntry.isDirectory()) {
        directories.push(join(entryPath, scopedEntry.name));
      }
    }
  }
  return Object.freeze(directories);
}

export async function discoverInstalledPackageDirectories(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const virtualStore = join(workspaceRoot, "node_modules", ".pnpm");
  const storeEntries = await readdir(virtualStore, { withFileTypes: true });
  const directories = new Set<string>();
  for (const storeEntry of storeEntries) {
    if (!storeEntry.isDirectory() || storeEntry.name === "node_modules") {
      continue;
    }
    const nestedNodeModules = join(virtualStore, storeEntry.name, "node_modules");
    for (const directory of await packageDirectories(nestedNodeModules)) {
      directories.add(directory);
    }
  }
  if (directories.size === 0) {
    throw new Error("pnpm virtual store contains no installed packages");
  }
  return Object.freeze([...directories].sort());
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectDependencyLocations(
  value: unknown,
): readonly DependencyLocation[] {
  const locations = new Map<string, DependencyLocation>();
  function visit(candidate: unknown): void {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) {
      return;
    }
    const name = candidate["name"];
    const version = candidate["version"];
    const path = candidate["path"];
    if (
      typeof name === "string" &&
      typeof version === "string" &&
      typeof path === "string"
    ) {
      locations.set(path, Object.freeze({ name, path, version }));
    }
    for (const key of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const dependencies = candidate[key];
      if (isRecord(dependencies)) {
        Object.values(dependencies).forEach(visit);
      }
    }
  }
  visit(value);
  return Object.freeze([...locations.values()]);
}

export function forbiddenLicenseReason(license: string): string | undefined {
  const trimmed = license.trim();
  const normalized = trimmed.toUpperCase();
  if (/\bA?GPL(?:-|\b)/u.test(normalized)) {
    return "GPL/AGPL license is not approved";
  }
  if (!RECOGNIZED_LICENSE_EXPRESSIONS.has(trimmed)) {
    return "unrecognized license expression requires review";
  }
  return undefined;
}
