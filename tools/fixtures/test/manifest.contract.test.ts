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
    "double//slash.txt",
    "trailing/",
    "manifest.json",
  ]) {
    const manifest = validManifest();
    manifest["entries"] = [{ ...validEntry, path }];
    assert.throws(() => parseFixtureManifest(manifest), FixtureIntegrityError);
  }

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
});
