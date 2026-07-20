import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

import { classifyTestFile, discoverTestFiles } from "../src/index.ts";

const controlledRoot = resolve("test-results", "g1-08-discovery");

async function temporaryRoot(): Promise<string> {
  await mkdir(controlledRoot, { recursive: true });
  return mkdtemp(join(controlledRoot, "workspace-"));
}

async function writeCandidate(root: string, path: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, "// discovery fixture\n", "utf8");
}

test("canonical test file names declare their layer", () => {
  assert.equal(classifyTestFile("test/parser.unit.test.ts"), "unit");
  assert.equal(classifyTestFile("test/project.contract.test.ts"), "contract");
  assert.equal(classifyTestFile("test/page.render.test.ts"), "render");
  assert.equal(classifyTestFile("test/sqlite.integration.test.ts"), "integration");
  assert.equal(classifyTestFile("test/export.e2e.test.ts"), "e2e");
  assert.equal(classifyTestFile("test/ambiguous.test.ts"), undefined);
  assert.equal(classifyTestFile("test/Foo.Unit.Test.ts"), undefined);
  assert.equal(classifyTestFile("test/wrong.unit.test.js"), undefined);
});

test("discovery covers the whole workspace and rejects case variants", async () => {
  const root = await temporaryRoot();
  const included = [
    "root-level.unit.test.ts",
    "tests/in-tests-dir.unit.test.ts",
    "e2e/in-e2e-dir.e2e.test.ts",
    "src/in-src-dir.unit.test.ts",
    "apps/web/a.unit.test.ts",
    "packages/p/b.contract.test.ts",
    "tools/t/c.render.test.ts",
    "tests/Sneaky.Test.ts",
  ];
  const skipped = [
    "node_modules/dependency/hidden.unit.test.ts",
    "dist/generated.e2e.test.ts",
    "tmp/probe.integration.test.ts",
  ];
  await Promise.all(
    [...included, ...skipped].map((path) => writeCandidate(root, path)),
  );

  const discovered = (await discoverTestFiles(root)).map((path) =>
    relative(root, path).replaceAll("\\", "/"),
  );
  assert.deepEqual(discovered.sort(), included.sort());
  const sneaky = discovered.find((path) => path.endsWith("Sneaky.Test.ts"));
  assert.notEqual(sneaky, undefined);
  assert.equal(classifyTestFile(sneaky ?? ""), undefined);
  await rm(root, { recursive: true });
});

test("a skipped-name directory link is rejected before exclusion", async () => {
  const root = await temporaryRoot();
  const outside = await temporaryRoot();
  const link = join(root, "dist");
  await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(discoverTestFiles(root), /symbolic links are not allowed/u);
  await unlink(link);
  await Promise.all([rm(root, { recursive: true }), rm(outside, { recursive: true })]);
});
