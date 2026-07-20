import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import test from "node:test";

import {
  buildTestIsolation,
  cleanupSuccessfulTestIsolation,
  prepareTestIsolation,
  type PreparedTestIsolation,
} from "@wenshu/test-support";

import { copyVerifiedFixtureSet, sha256, verifyFixtureSet } from "../src/index.ts";

const sourceRoot = resolve(import.meta.dirname, "../../../docs/poc-a/fixtures");
const controlledRoot = resolve("test-results", "g1-10-copy");

async function prepare(workerIndex: number): Promise<PreparedTestIsolation> {
  await mkdir(controlledRoot, { recursive: true });
  const root = await mkdtemp(join(controlledRoot, "run-"));
  return prepareTestIsolation(
    buildTestIsolation({
      controlledRoot: root,
      runId: "fixture-copy",
      workerIndex,
      layer: "integration",
    }),
  );
}

test("verified fixtures copy byte-for-byte only into an isolated worker", async () => {
  const before = await verifyFixtureSet(sourceRoot);
  const isolation = await prepare(0);
  try {
    const result = await copyVerifiedFixtureSet(sourceRoot, isolation);
    assert.equal(
      result.copyDirectory,
      join(isolation.filesDirectory, "poc-a-fixtures"),
    );
    assert.equal(
      result.evidenceManifestPath,
      join(isolation.filesDirectory, "fixture-copy-manifest.json"),
    );
    for (const entry of before.manifest.entries) {
      const original = await readFile(join(sourceRoot, ...entry.path.split("/")));
      const copied = await readFile(
        join(result.copyDirectory, ...entry.path.split("/")),
      );
      assert.equal(sha256(original), entry.sha256);
      assert.equal(sha256(copied), entry.sha256);
      assert.deepEqual(copied, original);
    }

    const evidenceText = await readFile(result.evidenceManifestPath, "utf8");
    const evidence = JSON.parse(evidenceText) as unknown;
    assert.deepEqual(evidence, result.evidence);
    assert.equal(evidenceText.includes(sourceRoot), false);
    assert.equal(evidenceText.includes(isolation.controlledRoot), false);
    assert.equal(isAbsolute(result.evidence.copy_root), false);

    await assert.rejects(copyVerifiedFixtureSet(sourceRoot, isolation), /EEXIST/u);
    const after = await verifyFixtureSet(sourceRoot);
    assert.equal(after.manifestSha256, before.manifestSha256);
  } finally {
    await cleanupSuccessfulTestIsolation(isolation);
    await rm(isolation.controlledRoot, { recursive: true });
  }
});

test("a frozen structural copy of an isolation handle cannot authorize writes", async () => {
  const isolation = await prepare(1);
  const forged = Object.freeze({ ...isolation }) as PreparedTestIsolation;
  try {
    await assert.rejects(
      copyVerifiedFixtureSet(sourceRoot, forged),
      /runtime-issued prepared isolation/u,
    );
  } finally {
    await cleanupSuccessfulTestIsolation(isolation);
    await rm(isolation.controlledRoot, { recursive: true });
  }
});
