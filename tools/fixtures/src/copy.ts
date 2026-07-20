import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  type PreparedTestIsolation,
  withPreparedTestIsolationOperation,
} from "@wenshu/test-support";

import { FixtureIntegrityError } from "./errors.ts";
import type { FixtureCopyEvidence, FixtureCopyResult, FixtureEntry } from "./types.ts";
import { sha256, verifyFixtureSet } from "./verify.ts";

const COPY_ROOT = "poc-a-fixtures";
const EVIDENCE_FILE = "fixture-copy-manifest.json";

async function copyEntry(
  sourceRoot: string,
  copyRoot: string,
  entry: FixtureEntry,
): Promise<void> {
  const segments = entry.path.split("/");
  const sourcePath = join(sourceRoot, ...segments);
  const destinationPath = join(copyRoot, ...segments);
  const sourceBytes = await readFile(sourcePath);
  if (sourceBytes.byteLength !== entry.bytes || sha256(sourceBytes) !== entry.sha256) {
    throw new FixtureIntegrityError(
      "FIXTURE_SET_MISMATCH",
      `fixture changed during copy: ${entry.path}`,
    );
  }
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, sourceBytes, { flag: "wx" });
  const copiedBytes = await readFile(destinationPath);
  if (copiedBytes.byteLength !== entry.bytes || sha256(copiedBytes) !== entry.sha256) {
    throw new FixtureIntegrityError(
      "FIXTURE_COPY_INVALID",
      `fixture copy failed verification: ${entry.path}`,
    );
  }
}

export async function copyVerifiedFixtureSet(
  sourceRoot: string,
  isolation: PreparedTestIsolation,
): Promise<FixtureCopyResult> {
  return withPreparedTestIsolationOperation(isolation, async () => {
    const verified = await verifyFixtureSet(sourceRoot);
    const copyDirectory = join(isolation.filesDirectory, COPY_ROOT);
    await mkdir(copyDirectory);
    for (const entry of verified.manifest.entries) {
      await copyEntry(verified.rootDirectory, copyDirectory, entry);
    }
    const finalVerification = await verifyFixtureSet(verified.rootDirectory);
    if (finalVerification.manifestSha256 !== verified.manifestSha256) {
      throw new FixtureIntegrityError(
        "FIXTURE_SET_MISMATCH",
        "fixture manifest changed during copy",
      );
    }
    const evidence: FixtureCopyEvidence = Object.freeze({
      schema_version: "0.1.0",
      fixture_set_id: "wenshu-poc-a",
      fixture_version: "1.0.0",
      source_manifest_sha256: verified.manifestSha256,
      project_id: isolation.projectId,
      copy_root: COPY_ROOT,
      entries: verified.manifest.entries,
    });
    const evidenceManifestPath = join(isolation.filesDirectory, EVIDENCE_FILE);
    await writeFile(evidenceManifestPath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return Object.freeze({ copyDirectory, evidenceManifestPath, evidence });
  });
}
