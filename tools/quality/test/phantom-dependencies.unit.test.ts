import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkPhantomDependencies,
  collectModuleSpecifiers,
  packageNameOfSpecifier,
} from "../src/index.ts";

test("specifier classification keeps only external package names", () => {
  assert.equal(packageNameOfSpecifier("eslint"), "eslint");
  assert.equal(packageNameOfSpecifier("eslint/rules"), "eslint");
  assert.equal(packageNameOfSpecifier("@eslint/js"), "@eslint/js");
  assert.equal(packageNameOfSpecifier("@eslint/js/configs"), "@eslint/js");
  assert.equal(packageNameOfSpecifier("node:fs"), undefined);
  assert.equal(packageNameOfSpecifier("./local.ts"), undefined);
  assert.equal(packageNameOfSpecifier("../up.ts"), undefined);
  assert.equal(packageNameOfSpecifier("D:/abs.ts"), undefined);
  assert.equal(packageNameOfSpecifier("@scope-only"), undefined);
});

test("specifier collection covers static, dynamic, re-export, and type references", () => {
  const text = [
    '/// <reference types="node" />',
    'import { ESLint } from "eslint";',
    'import type { Ajv } from "ajv";',
    'export { helper } from "./local.ts";',
    'export * from "prettier";',
    'const loaded = await import("typescript");',
    'import "vite/client";',
    '// from "commented-out"',
  ].join("\n");
  const specifiers = collectModuleSpecifiers("sample.ts", text);
  assert.deepEqual(specifiers, [
    "eslint",
    "ajv",
    "./local.ts",
    "prettier",
    "typescript",
    "vite/client",
    "node",
  ]);
});

test("phantom dependency check flags only undeclared external imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-phantom-"));
  try {
    const packageDirectory = join(root, "packages", "demo");
    await mkdir(join(packageDirectory, "src"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "root", private: true }),
    );
    await writeFile(
      join(packageDirectory, "package.json"),
      JSON.stringify({
        name: "@demo/pkg",
        dependencies: { ajv: "8.20.0" },
        devDependencies: { "@types/node": "24.13.3" },
      }),
    );
    await writeFile(
      join(packageDirectory, "src", "index.ts"),
      [
        'import { validate } from "ajv";',
        'import { helper } from "./helper.ts";',
        '/// <reference types="node" />',
        'export { something } from "undeclared-pkg";',
      ].join("\n"),
    );
    const files = [
      join(root, "package.json"),
      join(packageDirectory, "package.json"),
      join(packageDirectory, "src", "index.ts"),
    ];
    const findings = await checkPhantomDependencies(root, files);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.rule, "phantom-dependency");
    assert.match(findings[0]?.message ?? "", /undeclared-pkg/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
