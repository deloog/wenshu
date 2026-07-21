import assert from "node:assert/strict";
import test from "node:test";

import {
  checkLicensePolicy,
  licensePolicyViolation,
  reviewedLicensesInUse,
  type SbomPackage,
} from "../src/index.ts";

function entry(license: string, name = "example"): SbomPackage {
  return Object.freeze({
    name,
    version: "1.0.0",
    license,
    direct: false,
    requested_by: Object.freeze([]),
  });
}

test("permissive and reviewed licenses pass, everything else fails closed", () => {
  for (const license of ["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"]) {
    assert.equal(licensePolicyViolation(license), undefined);
  }
  for (const license of ["MPL-2.0", "Python-2.0", "BlueOak-1.0.0"]) {
    assert.equal(licensePolicyViolation(license), undefined);
  }
  for (const license of [
    "GPL-3.0-only",
    "AGPL-3.0-or-later",
    "LGPL-2.1-only",
    "UNKNOWN",
    "CC0-1.0",
    "MIT OR Apache-2.0",
    "unlicense",
  ]) {
    assert.notEqual(licensePolicyViolation(license), undefined);
  }
});

test("policy findings identify every violating package", () => {
  const findings = checkLicensePolicy([
    entry("MIT", "ok"),
    entry("GPL-3.0-only", "bad-copyleft"),
    entry("UNKNOWN", "bad-missing"),
  ]);
  assert.deepEqual(
    findings.map(({ packageName }) => packageName),
    ["bad-copyleft", "bad-missing"],
  );
});

test("reviewed licenses in use are reported for documentation cross-check", () => {
  const inUse = reviewedLicensesInUse([
    entry("MPL-2.0", "lightningcss"),
    entry("MIT", "ok"),
    entry("MPL-2.0", "lightningcss-win32"),
  ]);
  assert.deepEqual(inUse.get("MPL-2.0"), [
    "lightningcss@1.0.0",
    "lightningcss-win32@1.0.0",
  ]);
  assert.equal(inUse.has("MIT"), false);
});
