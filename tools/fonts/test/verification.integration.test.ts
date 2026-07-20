import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildTestIsolation,
  cleanupSuccessfulTestIsolation,
  prepareTestIsolation,
  type PreparedTestIsolation,
} from "@wenshu/test-support";

import { FontIntegrityError, verifyFontSet } from "../src/index.ts";

const sourceRoot = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R",
);
const controlledRoot = resolve("test-results", "g1-13-fonts");

async function prepare(workerIndex: number): Promise<PreparedTestIsolation> {
  await mkdir(controlledRoot, { recursive: true });
  const root = await mkdtemp(join(controlledRoot, "run-"));
  return prepareTestIsolation(
    buildTestIsolation({
      controlledRoot: root,
      runId: "font-integrity",
      workerIndex,
      layer: "integration",
    }),
  );
}

async function expectIntegrityFailure(
  operation: () => Promise<unknown>,
): Promise<FontIntegrityError> {
  try {
    await operation();
  } catch (error: unknown) {
    assert.ok(error instanceof FontIntegrityError);
    return error;
  }
  assert.fail("expected font integrity verification to fail");
}

test("committed font set and every frozen payload byte are integrity checked", async () => {
  const verified = await verifyFontSet(sourceRoot);
  assert.equal(verified.manifest.files.length, 3);
  assert.deepEqual(
    verified.manifest.files.map(({ weight }) => weight),
    [700, 500, 400],
  );

  const isolation = await prepare(0);
  const copyRoot = join(isolation.filesDirectory, "font-set");
  try {
    await cp(sourceRoot, copyRoot, { recursive: true });
    const payloads = [
      "LICENSE.txt",
      ...verified.manifest.files.map(({ path }) => path),
    ];
    for (const path of payloads) {
      const filePath = join(copyRoot, path);
      const original = await readFile(filePath);
      const changed = Buffer.from(original);
      const middle = Math.floor(changed.byteLength / 2);
      const originalByte = changed[middle];
      if (originalByte === undefined) {
        assert.fail("frozen font payload must not be empty");
      }
      changed[middle] = originalByte ^ 1;
      await writeFile(filePath, changed);
      const error = await expectIntegrityFailure(() => verifyFontSet(copyRoot));
      assert.match(error.code, /^FONT_(?:FILE|LICENSE)_INVALID$/u);
      await writeFile(filePath, original);
      await verifyFontSet(copyRoot);
    }
  } finally {
    await cleanupSuccessfulTestIsolation(isolation);
    await rm(isolation.controlledRoot, { recursive: true });
  }
});

test("manifest changes and unregistered directory entries fail closed", async () => {
  const isolation = await prepare(1);
  const copyRoot = join(isolation.filesDirectory, "font-set");
  try {
    await cp(sourceRoot, copyRoot, { recursive: true });
    const manifestPath = join(copyRoot, "font-manifest.json");
    const manifest = await readFile(manifestPath);
    const regularPath = join(copyRoot, "SourceHanSansCN-Regular.otf");
    const regular = await readFile(regularPath);
    const changedRegular = Buffer.from(regular);
    changedRegular[0] = changedRegular[0] === 0 ? 1 : 0;
    const originalDigest = createHash("sha256").update(regular).digest("hex");
    const changedDigest = createHash("sha256").update(changedRegular).digest("hex");
    const selfConsistentManifest = manifest
      .toString("utf8")
      .replace(originalDigest, changedDigest);
    assert.notEqual(selfConsistentManifest, manifest.toString("utf8"));
    await writeFile(regularPath, changedRegular);
    await writeFile(manifestPath, selfConsistentManifest);
    assert.equal(
      (await expectIntegrityFailure(() => verifyFontSet(copyRoot))).code,
      "FONT_MANIFEST_INVALID",
    );
    await writeFile(regularPath, regular);
    await writeFile(manifestPath, manifest);

    await writeFile(manifestPath, Buffer.concat([manifest, Buffer.from("\n")]));
    assert.equal(
      (await expectIntegrityFailure(() => verifyFontSet(copyRoot))).code,
      "FONT_MANIFEST_INVALID",
    );
    await writeFile(manifestPath, manifest);
    await mkdir(join(copyRoot, "unregistered"));
    assert.equal(
      (await expectIntegrityFailure(() => verifyFontSet(copyRoot))).code,
      "FONT_SET_MISMATCH",
    );
  } finally {
    await cleanupSuccessfulTestIsolation(isolation);
    await rm(isolation.controlledRoot, { recursive: true });
  }
});

test("a linked root is rejected without exposing its absolute target", async () => {
  const isolation = await prepare(2);
  const linkedRoot = join(isolation.filesDirectory, "font-link");
  try {
    await symlink(sourceRoot, linkedRoot, "junction");
    const error = await expectIntegrityFailure(() => verifyFontSet(linkedRoot));
    assert.equal(error.code, "FONT_SET_MISMATCH");
    assert.equal(error.message.includes(sourceRoot), false);
  } finally {
    await cleanupSuccessfulTestIsolation(isolation);
    await rm(isolation.controlledRoot, { recursive: true });
  }
});

test("missing roots fail closed without leaking absolute paths", async () => {
  const missing = resolve(controlledRoot, "missing-font-root");
  const error = await expectIntegrityFailure(() => verifyFontSet(missing));
  assert.equal(error.code, "FONT_SET_MISMATCH");
  assert.equal(error.message.includes(missing), false);
  assert.equal(/ENOENT|EACCES/u.test(error.message), false);
});
