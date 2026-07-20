import { readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { classifyTestFile, type TestLayer } from "./layers.ts";

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".cache",
  ".turbo",
  ".vite",
  ".deveco",
  ".hvigor",
  ".idea",
  ".vscode",
  "node_modules",
  "oh_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "test-results",
  "artifacts",
  "tmp",
]);

async function walk(directory: string, files: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`symbolic links are not allowed in test discovery: ${path}`);
      }
      if (SKIPPED_DIRECTORIES.has(entry.name.toLowerCase())) {
        return;
      }
      if (entry.isDirectory()) {
        await walk(path, files);
        return;
      }
      if (entry.isFile()) {
        files.push(path);
      }
    }),
  );
}

export async function discoverWorkspaceFiles(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const absoluteRoot = resolve(workspaceRoot);
  const files: string[] = [];
  await walk(absoluteRoot, files);
  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

export async function discoverTestFiles(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const files = await discoverWorkspaceFiles(workspaceRoot);
  return Object.freeze(
    files.filter((file) => {
      const lowercaseName = basename(file).toLowerCase();
      return lowercaseName.includes(".test.") || lowercaseName.includes(".spec.");
    }),
  );
}

export async function discoverLayerTests(
  workspaceRoot: string,
  layer: TestLayer,
): Promise<readonly string[]> {
  const files = await discoverTestFiles(workspaceRoot);
  return Object.freeze(files.filter((file) => classifyTestFile(file) === layer));
}

export function displayTestPath(workspaceRoot: string, filePath: string): string {
  return relative(resolve(workspaceRoot), filePath).replaceAll("\\", "/");
}
