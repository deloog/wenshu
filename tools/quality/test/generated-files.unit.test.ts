import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { inspectGeneratedFileRegistry } from "../src/index.ts";

const controlledRoot = resolve("test-results", "g1-09-generated-registry");

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

test("only manifest-registered generated files receive generated status", async () => {
  await mkdir(controlledRoot, { recursive: true });
  const root = await mkdtemp(join(controlledRoot, "workspace-"));
  const packageRoot = join(root, "packages", "sample");
  const packageJson = join(packageRoot, "package.json");
  const registered = join(packageRoot, "src", "generated", "types.ts");
  const unregistered = join(packageRoot, "src", "generated", "handwritten.ts");
  await write(
    packageJson,
    JSON.stringify({
      scripts: { "generate:check": "node scripts/check-generated.ts" },
      wenshu: { generatedFiles: ["src/generated/types.ts"] },
    }),
  );
  await write(registered, "export interface Generated {}\n");
  await write(unregistered, "export const handwritten = true;\n");

  const valid = await inspectGeneratedFileRegistry(root, [packageJson, registered]);
  assert.deepEqual(valid.findings, []);
  assert.deepEqual(valid.generatedFiles, [registered]);

  const invalid = await inspectGeneratedFileRegistry(root, [
    packageJson,
    registered,
    unregistered,
  ]);
  assert.equal(invalid.findings.length, 1);
  assert.match(invalid.findings[0]?.message ?? "", /unregistered file/u);
  await rm(root, { recursive: true });
});
