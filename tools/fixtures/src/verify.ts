import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { FixtureIntegrityError } from "./errors.ts";
import { parseFixtureManifest } from "./manifest.ts";
import type { FixtureEntry, VerifiedFixtureSet } from "./types.ts";

export const FIXTURE_MANIFEST_SHA256 =
  "97e05a1c397572521351dc790ed1b0cb8821666b7d2d747477d20b9a0de72017";
const MANIFEST_FILE = "manifest.json";
const MAX_DIRECTORY_DEPTH = 8;
const MAX_DISCOVERED_FILES = 128;
const MAX_MANIFEST_BYTES = 64 * 1024;

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function portablePath(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join("/");
}

async function discoverFiles(
  root: string,
  directory: string,
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_DIRECTORY_DEPTH) {
    throw new FixtureIntegrityError(
      "FIXTURE_SET_MISMATCH",
      "fixture directory exceeds the nesting budget",
    );
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) {
      throw new FixtureIntegrityError(
        "FIXTURE_SET_MISMATCH",
        "fixture directory contains a filesystem link",
      );
    }
    if (stats.isDirectory()) {
      paths.push(...(await discoverFiles(root, entryPath, depth + 1)));
    } else if (stats.isFile()) {
      paths.push(portablePath(root, entryPath));
    } else {
      throw new FixtureIntegrityError(
        "FIXTURE_SET_MISMATCH",
        "fixture directory contains an unsupported filesystem entry",
      );
    }
    if (paths.length > MAX_DISCOVERED_FILES) {
      throw new FixtureIntegrityError(
        "FIXTURE_SET_MISMATCH",
        "fixture directory exceeds the file-count budget",
      );
    }
  }
  return paths;
}

async function verifyEntry(root: string, entry: FixtureEntry): Promise<void> {
  const bytes = await readFile(join(root, ...entry.path.split("/")));
  if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256) {
    throw new FixtureIntegrityError(
      "FIXTURE_SET_MISMATCH",
      `fixture bytes do not match manifest: ${entry.path}`,
    );
  }
}

export async function verifyFixtureSet(
  rootDirectory: string,
): Promise<VerifiedFixtureSet> {
  const root = resolve(rootDirectory);
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new FixtureIntegrityError(
      "FIXTURE_SET_MISMATCH",
      "fixture root must be a real directory",
    );
  }

  const manifestPath = join(root, MANIFEST_FILE);
  const manifestStats = await lstat(manifestPath);
  if (
    !manifestStats.isFile() ||
    manifestStats.isSymbolicLink() ||
    manifestStats.size > MAX_MANIFEST_BYTES
  ) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture manifest must be a bounded real file",
    );
  }
  const manifestBytes = await readFile(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== FIXTURE_MANIFEST_SHA256) {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture manifest does not match its frozen digest",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  } catch {
    throw new FixtureIntegrityError(
      "FIXTURE_MANIFEST_INVALID",
      "fixture manifest is not valid JSON",
    );
  }
  const manifest = parseFixtureManifest(parsed);
  const discovered = (await discoverFiles(root, root))
    .filter((path) => path !== MANIFEST_FILE)
    .sort((left, right) => left.localeCompare(right, "en"));
  const expected = manifest.entries.map((entry) => entry.path);
  if (
    discovered.length !== expected.length ||
    discovered.some((path, index) => path !== expected[index])
  ) {
    throw new FixtureIntegrityError(
      "FIXTURE_SET_MISMATCH",
      "fixture directory contents do not match the manifest",
    );
  }
  await Promise.all(manifest.entries.map((entry) => verifyEntry(root, entry)));
  return Object.freeze({ rootDirectory: root, manifest, manifestSha256 });
}
