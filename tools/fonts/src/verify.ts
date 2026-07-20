import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { FontIntegrityError, type FontIntegrityCode } from "./errors.ts";
import { parseFontManifest } from "./manifest.ts";
import type { FontFileEntry, VerifiedFontSet } from "./types.ts";

export const FONT_MANIFEST_SHA256 =
  "2952b96f2d74300a26382349816020a21731b06cd811ce37ed60dafbdc684721";
const MANIFEST_FILE = "font-manifest.json";
const MAX_MANIFEST_BYTES = 64 * 1024;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function classifyFileSystemFailure<Result>(
  code: FontIntegrityCode,
  message: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof FontIntegrityError) {
      throw error;
    }
    throw new FontIntegrityError(code, message);
  }
}

async function verifyFontFile(root: string, entry: FontFileEntry): Promise<void> {
  const bytes = await classifyFileSystemFailure(
    "FONT_FILE_INVALID",
    `font file cannot be read: ${entry.path}`,
    () => readFile(join(root, entry.path)),
  );
  if (
    bytes.byteLength !== entry.bytes ||
    sha256(bytes) !== entry.sha256 ||
    bytes.subarray(0, 4).toString("ascii") !== "OTTO"
  ) {
    throw new FontIntegrityError(
      "FONT_FILE_INVALID",
      `font file does not match its frozen identity: ${entry.path}`,
    );
  }
}

export async function verifyFontSet(rootDirectory: string): Promise<VerifiedFontSet> {
  const root = resolve(rootDirectory);
  const rootStats = await classifyFileSystemFailure(
    "FONT_SET_MISMATCH",
    "font root cannot be inspected",
    () => lstat(root),
  );
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new FontIntegrityError(
      "FONT_SET_MISMATCH",
      "font root must be a real directory",
    );
  }
  const manifestPath = join(root, MANIFEST_FILE);
  const manifestStats = await classifyFileSystemFailure(
    "FONT_MANIFEST_INVALID",
    "font manifest cannot be inspected",
    () => lstat(manifestPath),
  );
  if (
    !manifestStats.isFile() ||
    manifestStats.isSymbolicLink() ||
    manifestStats.size > MAX_MANIFEST_BYTES
  ) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font manifest must be a bounded real file",
    );
  }
  const manifestBytes = await classifyFileSystemFailure(
    "FONT_MANIFEST_INVALID",
    "font manifest cannot be read",
    () => readFile(manifestPath),
  );
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== FONT_MANIFEST_SHA256) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font manifest does not match its frozen digest",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  } catch {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font manifest is not valid JSON",
    );
  }
  const manifest = parseFontManifest(parsed);
  const directoryEntries = await classifyFileSystemFailure(
    "FONT_SET_MISMATCH",
    "font directory cannot be enumerated",
    () => readdir(root, { withFileTypes: true }),
  );
  const discovered: string[] = [];
  for (const entry of directoryEntries) {
    const stats = await classifyFileSystemFailure(
      "FONT_SET_MISMATCH",
      "font directory entry cannot be inspected",
      () => lstat(join(root, entry.name)),
    );
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new FontIntegrityError(
        "FONT_SET_MISMATCH",
        "font directory contains a link or non-file entry",
      );
    }
    discovered.push(entry.name);
  }
  discovered.sort((left, right) => left.localeCompare(right, "en"));
  const expected = [
    MANIFEST_FILE,
    manifest.license.path,
    ...manifest.files.map((file) => file.path),
  ].sort((left, right) => left.localeCompare(right, "en"));
  if (
    discovered.length !== expected.length ||
    discovered.some((path, index) => path !== expected[index])
  ) {
    throw new FontIntegrityError(
      "FONT_SET_MISMATCH",
      "font directory contents do not match the manifest",
    );
  }
  const licenseBytes = await classifyFileSystemFailure(
    "FONT_LICENSE_INVALID",
    "font license cannot be read",
    () => readFile(join(root, manifest.license.path)),
  );
  const licenseText = licenseBytes.toString("utf8");
  if (
    licenseBytes.byteLength !== manifest.license.bytes ||
    sha256(licenseBytes) !== manifest.license.sha256 ||
    !licenseText.includes("SIL OPEN FONT LICENSE Version 1.1") ||
    !/Reserved Font\s+Name 'Source'/u.test(licenseText)
  ) {
    throw new FontIntegrityError(
      "FONT_LICENSE_INVALID",
      "font license does not match the frozen OFL identity",
    );
  }
  await Promise.all(manifest.files.map((entry) => verifyFontFile(root, entry)));
  return Object.freeze({ rootDirectory: root, manifestSha256, manifest });
}
