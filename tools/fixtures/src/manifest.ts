import { posix } from "node:path";

import { FixtureIntegrityError } from "./errors.ts";
import type { FixtureEntry, FixtureManifest } from "./types.ts";

const MANIFEST_KEYS = Object.freeze([
  "entries",
  "fixture_set_id",
  "fixture_version",
  "schema_version",
]);
const ENTRY_KEYS = Object.freeze(["bytes", "path", "sha256"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_FIXTURE_BYTES = 50 * 1024 * 1024;
const MAX_FIXTURE_COUNT = 128;
const WINDOWS_RESERVED_NAME_PATTERN =
  /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)/iu;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

// Windows-forbidden characters (FX-06): < > " | ? * and the drive colon.
// Colon was already rejected; the remaining six are now equally fail-closed so
// the "Windows 与 POSIX 均可移植"承诺完整成立。
const WINDOWS_FORBIDDEN_CHARACTER_PATTERN = /[<>:"|?*]/u;

export function isCanonicalFixturePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    containsControlCharacter(value) ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    posix.normalize(value) !== value
  ) {
    return false;
  }
  return value
    .split("/")
    .every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        !WINDOWS_FORBIDDEN_CHARACTER_PATTERN.test(segment) &&
        !segment.endsWith(" ") &&
        !segment.endsWith(".") &&
        !WINDOWS_RESERVED_NAME_PATTERN.test(segment),
    );
}

function parseEntry(value: unknown): FixtureEntry {
  if (!isRecord(value) || !hasExactKeys(value, ENTRY_KEYS)) {
    throw new FixtureIntegrityError(
      "FIXTURE_ENTRY_INVALID",
      "fixture entry must contain exactly bytes, path, and sha256",
    );
  }
  const path = value["path"];
  const bytes = value["bytes"];
  const sha256 = value["sha256"];
  if (typeof path !== "string" || !isCanonicalFixturePath(path)) {
    throw new FixtureIntegrityError(
      "FIXTURE_ENTRY_INVALID",
      "fixture entry path is not canonical",
    );
  }
  if (!Number.isSafeInteger(bytes) || typeof bytes !== "number" || bytes < 0) {
    throw new FixtureIntegrityError(
      "FIXTURE_ENTRY_INVALID",
      "fixture entry byte count must be a non-negative safe integer",
    );
  }
  if (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256)) {
    throw new FixtureIntegrityError(
      "FIXTURE_ENTRY_INVALID",
      "fixture entry sha256 must be lowercase hexadecimal",
    );
  }
  return Object.freeze({ path, bytes, sha256 });
}

export function parseFixtureManifest(value: unknown): FixtureManifest {
  if (!isRecord(value) || !hasExactKeys(value, MANIFEST_KEYS)) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture manifest contains missing or unknown fields",
    );
  }
  if (
    value["schema_version"] !== "0.1.0" ||
    value["fixture_set_id"] !== "wenshu-poc-a" ||
    value["fixture_version"] !== "1.0.0" ||
    !Array.isArray(value["entries"]) ||
    value["entries"].length === 0 ||
    value["entries"].length > MAX_FIXTURE_COUNT
  ) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture manifest identity or entries are invalid",
    );
  }

  const entries = value["entries"].map(parseEntry);
  const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  if (totalBytes > MAX_FIXTURE_BYTES) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture manifest exceeds the total byte budget",
    );
  }
  const paths = entries.map((entry) => entry.path);
  const sorted = [...paths].sort((left, right) => left.localeCompare(right, "en"));
  const portable = new Set(paths.map((path) => path.toLocaleLowerCase("en-US")));
  if (paths.some((path, index) => path !== sorted[index])) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture entries must use canonical sorted order",
    );
  }
  if (new Set(paths).size !== paths.length) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture entries must use unique paths",
    );
  }
  if (portable.size !== paths.length) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture entries must use unique portable path identity",
    );
  }
  if (paths.includes("manifest.json")) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture entries must exclude manifest.json",
    );
  }

  return Object.freeze({
    schema_version: "0.1.0",
    fixture_set_id: "wenshu-poc-a",
    fixture_version: "1.0.0",
    entries: Object.freeze(entries),
  });
}
