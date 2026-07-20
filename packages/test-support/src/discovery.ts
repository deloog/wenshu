import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { classifyTestFile, type TestLayer } from "./layers.ts";

const SEARCH_ROOTS = Object.freeze(["apps", "packages", "tools"]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "test-results",
  "artifacts",
]);

async function walk(directory: string, files: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        return;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`symbolic links are not allowed in test discovery: ${path}`);
      }
      if (entry.isDirectory()) {
        await walk(path, files);
        return;
      }
      if (
        entry.isFile() &&
        (entry.name.includes(".test.") || entry.name.includes(".spec."))
      ) {
        files.push(path);
      }
    }),
  );
}

export async function discoverTestFiles(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const absoluteRoot = resolve(workspaceRoot);
  const files: string[] = [];
  for (const rootName of SEARCH_ROOTS) {
    await walk(join(absoluteRoot, rootName), files);
  }
  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

export async function discoverLayerTests(
  workspaceRoot: string,
  layer: TestLayer,
): Promise<readonly string[]> {
  const files = await discoverTestFiles(workspaceRoot);
  return Object.freeze(
    files.filter((file) => classifyTestFile(file) === layer),
  );
}

export function displayTestPath(workspaceRoot: string, filePath: string): string {
  return relative(resolve(workspaceRoot), filePath).replaceAll("\\", "/");
}
