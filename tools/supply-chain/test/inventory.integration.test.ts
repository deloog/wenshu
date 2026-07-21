import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildSbom,
  checkLicensePolicy,
  licensePolicyViolation,
  reviewedLicensesInUse,
  REVIEWED_LICENSES,
  serializeSbom,
} from "../src/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

test("the installed dependency tree rebuilds the committed sbom byte-for-byte", async () => {
  const committed = await readFile(resolve(workspaceRoot, "sbom", "sbom.json"), "utf8");
  const rebuilt = await buildSbom(workspaceRoot);
  assert.equal(serializeSbom(rebuilt), committed);
  assert.equal(checkLicensePolicy(rebuilt.packages).length, 0);

  // Every reviewed license in the tree is limited to the documented set.
  const inUse = reviewedLicensesInUse(rebuilt.packages);
  for (const license of inUse.keys()) {
    assert.ok(REVIEWED_LICENSES.has(license));
  }
  assert.deepEqual(inUse.get("MPL-2.0"), [
    "lightningcss@1.32.0",
    "lightningcss-win32-x64-msvc@1.32.0",
  ]);
  assert.deepEqual(inUse.get("Python-2.0"), ["argparse@2.0.1"]);
  assert.deepEqual(inUse.get("BlueOak-1.0.0"), ["minimatch@10.2.5"]);
});

test("policy violation detection is decisive against license tampering", async () => {
  const rebuilt = await buildSbom(workspaceRoot);
  const tampered = rebuilt.packages.map((entry) =>
    entry.name === "eslint" ? { ...entry, license: "GPL-3.0-only" } : entry,
  );
  const findings = checkLicensePolicy(tampered);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.packageName, "eslint");
  assert.notEqual(licensePolicyViolation("GPL-3.0-only"), undefined);
});

test("every external dependency declared by a workspace is installed and direct", async () => {
  const rebuilt = await buildSbom(workspaceRoot);
  const directNames = new Set(
    rebuilt.packages.filter(({ direct }) => direct).map(({ name }) => name),
  );
  for (const expected of [
    "@eslint/js",
    "@types/node",
    "ajv",
    "eslint",
    "json-schema-to-typescript",
    "prettier",
    "typescript",
    "typescript-eslint",
    "vite",
  ]) {
    assert.ok(directNames.has(expected), `${expected} must be a direct dependency`);
  }
});
