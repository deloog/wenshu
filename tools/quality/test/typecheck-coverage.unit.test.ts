import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { checkStrictBaseConfig, checkTypecheckCoverage } from "../src/index.ts";

const controlledRoot = resolve("test-results", "g1-09-typecheck");

async function temporaryWorkspace(): Promise<string> {
  await mkdir(controlledRoot, { recursive: true });
  return mkdtemp(join(controlledRoot, "workspace-"));
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

test("coverage reports package TypeScript omitted by tsconfig", async () => {
  const root = await temporaryWorkspace();
  const packageRoot = join(root, "packages", "sample");
  const packageJson = join(packageRoot, "package.json");
  const source = join(packageRoot, "src", "index.ts");
  const missedTest = join(packageRoot, "test", "missed.unit.test.ts");
  const missedModule = join(packageRoot, "test", "missed.mts");
  await write(
    packageJson,
    JSON.stringify({ scripts: { typecheck: "tsc -p tsconfig.json" } }),
  );
  await write(
    join(packageRoot, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] }),
  );
  await write(source, "export const value = 1;\n");
  await write(missedTest, "export const missed = true;\n");
  await write(missedModule, "export const moduleMissed = true;\n");

  const files = [packageJson, source, missedTest, missedModule];
  const findings = await checkTypecheckCoverage(root, files);
  assert.equal(findings.length, 2);
  assert.ok(findings.every((finding) => /outside typecheck/u.test(finding.message)));

  await write(
    join(packageRoot, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true }, include: ["src", "test"] }),
  );
  assert.deepEqual(await checkTypecheckCoverage(root, files), []);
  await rm(root, { recursive: true });
});

test("coverage rejects a misleading package typecheck command", async () => {
  const root = await temporaryWorkspace();
  const packageRoot = join(root, "tools", "sample");
  const packageJson = join(packageRoot, "package.json");
  const source = join(packageRoot, "src", "index.ts");
  await write(packageJson, JSON.stringify({ scripts: { typecheck: "echo pass" } }));
  await write(join(packageRoot, "tsconfig.json"), JSON.stringify({ include: ["src"] }));
  await write(source, "export const value = 1;\n");
  const findings = await checkTypecheckCoverage(root, [packageJson, source]);
  assert.ok(findings.some((finding) => finding.message.includes("exact typecheck")));
  await rm(root, { recursive: true });
});

test("strict base options are executable requirements", async () => {
  const root = await temporaryWorkspace();
  await write(
    join(root, "tsconfig.base.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noImplicitAny: true,
        useUnknownInCatchVariables: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: false,
      },
    }),
  );
  assert.deepEqual(await checkStrictBaseConfig(root), []);
  await write(
    join(root, "tsconfig.base.json"),
    JSON.stringify({ compilerOptions: { strict: false, skipLibCheck: true } }),
  );
  const findings = await checkStrictBaseConfig(root);
  assert.ok(findings.some((message) => message.includes("strict")));
  assert.ok(findings.some((message) => message.includes("skipLibCheck")));
  await rm(root, { recursive: true });
});
