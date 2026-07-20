import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildTestIsolation,
  cleanupSuccessfulTestIsolation,
  prepareTestIsolation,
  type PreparedTestIsolation,
  writeFailureEvidence,
} from "../src/index.ts";

const controlledRoot = resolve("test-results", "g1-11-evidence-ownership");

async function temporaryRoot(): Promise<string> {
  await mkdir(controlledRoot, { recursive: true });
  return mkdtemp(join(controlledRoot, "run-"));
}

function evidenceInput() {
  return {
    caseId: "ownership-proof",
    layer: "unit" as const,
    seed: "seed-ownership-01",
    errorName: "AssertionError",
    errorMessage: "evidence must survive",
  };
}

test("evidence rejects unprepared and brand-stripped handles", async () => {
  const root = await temporaryRoot();
  const unprepared = buildTestIsolation({
    controlledRoot: root,
    runId: "unprepared-proof",
    workerIndex: 0,
    layer: "unit",
  }) as PreparedTestIsolation;
  await assert.rejects(
    writeFailureEvidence(unprepared, evidenceInput()),
    /runtime-issued prepared isolation/u,
  );

  const prepared = await prepareTestIsolation(
    buildTestIsolation({
      controlledRoot: root,
      runId: "brand-proof",
      workerIndex: 1,
      layer: "unit",
    }),
  );
  const brandStripped = structuredClone(prepared) as PreparedTestIsolation;
  await assert.rejects(
    writeFailureEvidence(brandStripped, evidenceInput()),
    /runtime-issued prepared isolation/u,
  );
  const brandCopied = { ...prepared } as PreparedTestIsolation;
  await assert.rejects(
    writeFailureEvidence(brandCopied, evidenceInput()),
    /runtime-issued prepared isolation/u,
  );
  await cleanupSuccessfulTestIsolation(prepared);
  await rm(root, { recursive: true });
});

test("evidence rejects a tampered disk claim without writing", async () => {
  const root = await temporaryRoot();
  const prepared = await prepareTestIsolation(
    buildTestIsolation({
      controlledRoot: root,
      runId: "claim-proof",
      workerIndex: 0,
      layer: "unit",
    }),
  );
  await writeFile(
    join(prepared.rootDirectory, "worker.claim"),
    "different-owner",
    "utf8",
  );
  await assert.rejects(
    writeFailureEvidence(prepared, evidenceInput()),
    /claim does not match/u,
  );
  await assert.rejects(
    readFile(join(prepared.evidenceDirectory, "ownership-proof", "failure.json")),
    /ENOENT/u,
  );
  await rm(root, { recursive: true });
});

test("non-empty evidence blocks cleanup and remains byte-identical", async () => {
  const root = await temporaryRoot();
  const prepared = await prepareTestIsolation(
    buildTestIsolation({
      controlledRoot: root,
      runId: "retention-proof",
      workerIndex: 0,
      layer: "unit",
    }),
  );
  const paths = await writeFailureEvidence(prepared, evidenceInput());
  const before = await Promise.all([
    readFile(paths.manifestPath),
    readFile(paths.logPath),
  ]);
  await assert.rejects(
    cleanupSuccessfulTestIsolation(prepared),
    /refuses non-empty failure evidence/u,
  );
  const after = await Promise.all([
    readFile(paths.manifestPath),
    readFile(paths.logPath),
  ]);
  assert.deepEqual(after, before);
  await rm(root, { recursive: true });
});

test("cleanup queued behind evidence writing cannot erase the result", async () => {
  const root = await temporaryRoot();
  const prepared = await prepareTestIsolation(
    buildTestIsolation({
      controlledRoot: root,
      runId: "concurrent-retention-proof",
      workerIndex: 0,
      layer: "unit",
    }),
  );
  const evidencePromise = writeFailureEvidence(prepared, evidenceInput());
  const cleanupPromise = cleanupSuccessfulTestIsolation(prepared);
  const paths = await evidencePromise;
  await assert.rejects(cleanupPromise, /refuses non-empty failure evidence/u);
  assert.match(await readFile(paths.manifestPath, "utf8"), /ownership-proof/u);
  await rm(root, { recursive: true });
});

test("cleanup preserves arbitrary screenshot or trace evidence", async () => {
  const root = await temporaryRoot();
  const prepared = await prepareTestIsolation(
    buildTestIsolation({
      controlledRoot: root,
      runId: "artifact-retention-proof",
      workerIndex: 0,
      layer: "e2e",
    }),
  );
  const artifactPath = join(prepared.evidenceDirectory, "failure.trace");
  await writeFile(artifactPath, "trace-bytes", "utf8");
  await assert.rejects(
    cleanupSuccessfulTestIsolation(prepared),
    /refuses non-empty failure evidence/u,
  );
  assert.equal(await readFile(artifactPath, "utf8"), "trace-bytes");
  await rm(root, { recursive: true });
});
