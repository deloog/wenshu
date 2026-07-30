import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkPhantomDependencies,
  checkUnusedProductionDependencies,
  collectModuleImports,
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
    'const common = require("node:fs");',
    'import legacy = require("node:path");',
    'import "vite/client";',
    '// from "commented-out"',
  ].join("\n");
  const imports = collectModuleImports("sample.ts", text);
  assert.deepEqual(
    imports.map(({ specifier, typeOnly, syntax }) => ({ specifier, typeOnly, syntax })),
    [
      { specifier: "eslint", typeOnly: false, syntax: "esm" },
      { specifier: "ajv", typeOnly: true, syntax: "esm" },
      { specifier: "./local.ts", typeOnly: false, syntax: "export-from" },
      { specifier: "prettier", typeOnly: false, syntax: "export-from" },
      { specifier: "typescript", typeOnly: false, syntax: "dynamic" },
      { specifier: "node:fs", typeOnly: false, syntax: "require" },
      { specifier: "node:path", typeOnly: false, syntax: "import-equals" },
      { specifier: "vite/client", typeOnly: false, syntax: "esm" },
      { specifier: "node", typeOnly: true, syntax: "reference" },
    ],
  );
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

test("a declared @types package never satisfies a value import", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-phantom-types-"));
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
        devDependencies: { "@types/some-lib": "1.0.0" },
      }),
    );
    await writeFile(
      join(packageDirectory, "src", "index.ts"),
      [
        'import type { Config } from "some-lib";',
        'import { create } from "some-lib";',
      ].join("\n"),
    );
    const files = [
      join(root, "package.json"),
      join(packageDirectory, "package.json"),
      join(packageDirectory, "src", "index.ts"),
    ];
    const findings = await checkPhantomDependencies(root, files);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /some-lib/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unused production dependencies fail while subpath imports count as use", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-unused-production-"));
  try {
    const packageDirectory = join(root, "packages", "project-storage");
    await mkdir(join(packageDirectory, "src"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "root", private: true }),
    );
    await writeFile(
      join(packageDirectory, "package.json"),
      JSON.stringify({
        name: "@wenshu/project-storage",
        dependencies: { ajv: "8.20.0", unused: "1.0.0" },
      }),
    );
    await writeFile(
      join(packageDirectory, "src", "index.ts"),
      'import "ajv/dist/2020.js";',
    );
    const files = [
      join(root, "package.json"),
      join(packageDirectory, "package.json"),
      join(packageDirectory, "src", "index.ts"),
    ];
    const findings = await checkUnusedProductionDependencies(root, files);
    assert.equal(findings.length, 1);
    assert.match(findings[0]?.message ?? "", /unused/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tsconfig compilerOptions.types consumes an @types production dependency", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-configured-types-"));
  try {
    const packageDirectory = join(root, "packages", "project-storage");
    await mkdir(join(packageDirectory, "src"), { recursive: true });
    await writeFile(
      join(packageDirectory, "package.json"),
      JSON.stringify({
        name: "@wenshu/project-storage",
        dependencies: { "@types/node": "24.13.3" },
      }),
    );
    const files = [
      join(packageDirectory, "package.json"),
      join(packageDirectory, "tsconfig.json"),
    ];
    const withoutConfiguration = await checkUnusedProductionDependencies(root, files);
    assert.equal(withoutConfiguration.length, 1);
    assert.match(withoutConfiguration[0]?.message ?? "", /@types\/node/u);
    await writeFile(
      join(packageDirectory, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { types: ["node"] } }),
    );
    const findings = await checkUnusedProductionDependencies(root, files);
    assert.deepEqual(findings, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
