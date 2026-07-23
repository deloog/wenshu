import assert from "node:assert/strict";
import test from "node:test";

import {
  FixtureIntegrityError,
  isCanonicalFixturePath,
  parseFixtureManifest,
} from "../src/index.ts";

const validEntry = Object.freeze({
  path: "nested/example.txt",
  bytes: 3,
  sha256: "a".repeat(64),
});

function validManifest(): Record<string, unknown> {
  return {
    schema_version: "0.1.0",
    fixture_set_id: "wenshu-poc-a",
    fixture_version: "1.0.0",
    entries: [validEntry],
  };
}

test("fixture manifest accepts only the frozen identity and exact shape", () => {
  const parsed = parseFixtureManifest(validManifest());
  assert.equal(parsed.entries[0]?.path, "nested/example.txt");
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.entries));

  for (const mutation of [
    { ...validManifest(), schema_version: "0.2.0" },
    { ...validManifest(), fixture_set_id: "other" },
    { ...validManifest(), fixture_version: "1.0.1" },
    { ...validManifest(), extra: true },
    { ...validManifest(), entries: [] },
  ]) {
    assert.throws(
      () => parseFixtureManifest(mutation),
      (error: unknown) =>
        error instanceof FixtureIntegrityError &&
        error.code === "FIXTURE_MANIFEST_INVALID",
    );
  }
});

test("entry paths, hashes, sizes, ordering, and portable identity fail closed", () => {
  for (const path of [
    "../escape.txt",
    "a/../escape.txt",
    "/absolute.txt",
    "C:\\absolute.txt",
    "C:drive-relative.txt",
    "stream:payload.txt",
    "con",
    "CoN.txt",
    "NUL.txt",
    "nul.tar.gz",
    "nested/COM1.log",
    "nested/lpt9",
    "trailing-space.txt ",
    "trailing-dot.txt.",
    "control\u001f.txt",
    "delete\u007f.txt",
    "double//slash.txt",
    "trailing/",
    "manifest.json",
  ]) {
    const manifest = validManifest();
    manifest["entries"] = [{ ...validEntry, path }];
    assert.throws(() => parseFixtureManifest(manifest), FixtureIntegrityError);
  }

  const portableCollision = validManifest();
  portableCollision["entries"] = [
    { ...validEntry, path: "a.txt" },
    { ...validEntry, path: "A.txt" },
  ];
  assert.throws(
    () => parseFixtureManifest(portableCollision),
    /portable path identity/u,
  );

  for (const entries of [
    [validEntry, { ...validEntry, path: "A.txt" }],
    [
      { ...validEntry, path: "b.txt" },
      { ...validEntry, path: "a.txt" },
    ],
    [{ ...validEntry, sha256: "A".repeat(64) }],
    [{ ...validEntry, bytes: -1 }],
    [{ ...validEntry, unknown: true }],
  ]) {
    const manifest = validManifest();
    manifest["entries"] = entries;
    assert.throws(() => parseFixtureManifest(manifest), FixtureIntegrityError);
  }
});

test("canonical fixture path predicate allows stable relative Unicode paths", () => {
  assert.equal(isCanonicalFixturePath("资产/图表1.png"), true);
  assert.equal(isCanonicalFixturePath("report.PDF"), true);
  assert.equal(isCanonicalFixturePath("."), false);
  assert.equal(isCanonicalFixturePath(".."), false);
  assert.equal(isCanonicalFixturePath("line\0break.txt"), false);
  assert.equal(isCanonicalFixturePath("data/report 1.0.txt"), true);
  assert.equal(isCanonicalFixturePath("console.txt"), true);
  assert.equal(isCanonicalFixturePath("com10.log"), true);
});

test("Windows-forbidden characters are rejected per segment (FX-06)", () => {
  for (const character of ["<", ">", '"', "|", "?", "*"]) {
    assert.equal(isCanonicalFixturePath(`a${character}b.png`), false);
    assert.equal(isCanonicalFixturePath(`dir/x${character}.png`), false);
    assert.equal(isCanonicalFixturePath(`di${character}r/x.png`), false);
  }
  // 既有允许面不回退：中文、大写扩展名、段内含点/空格仍合法。
  assert.equal(isCanonicalFixturePath("资产/图表1.png"), true);
  assert.equal(isCanonicalFixturePath("data/report 1.0.txt"), true);
});
