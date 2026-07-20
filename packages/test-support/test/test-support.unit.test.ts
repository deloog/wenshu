import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildTestIsolation,
  classifyTestFile,
  prepareTestIsolation,
  writeFailureEvidence,
} from "../src/index.ts";

const controlledRoot = resolve("test-results", "g1-08-unit");

async function temporaryRoot(): Promise<string> {
  await mkdir(controlledRoot, { recursive: true });
  return mkdtemp(join(controlledRoot, "run-"));
}

test("test file names declare their actual layer", () => {
  assert.equal(classifyTestFile("test/parser.unit.test.ts"), "unit");
  assert.equal(
    classifyTestFile("test/project.contract.test.ts"),
    "contract",
  );
  assert.equal(classifyTestFile("test/page.render.test.ts"), "render");
  assert.equal(
    classifyTestFile("test/sqlite.integration.test.ts"),
    "integration",
  );
  assert.equal(classifyTestFile("test/export.e2e.test.ts"), "e2e");
  assert.equal(classifyTestFile("test/ambiguous.test.ts"), undefined);
  assert.equal(classifyTestFile("test/hidden.spec.ts"), undefined);
  assert.equal(classifyTestFile("test/wrong.unit.test.js"), undefined);
});

test("two workers receive distinct directories, projects, and ports", async () => {
  const root = await temporaryRoot();
  const first = buildTestIsolation({
    controlledRoot: root,
    runId: "parallel-proof",
    workerIndex: 0,
    layer: "integration",
  });
  const second = buildTestIsolation({
    controlledRoot: root,
    runId: "parallel-proof",
    workerIndex: 1,
    layer: "integration",
  });

  await Promise.all([
    prepareTestIsolation(first),
    prepareTestIsolation(second),
  ]);
  await Promise.all([
    writeFile(join(first.filesDirectory, "worker.log"), first.projectId, "utf8"),
    writeFile(
      join(second.filesDirectory, "worker.log"),
      second.projectId,
      "utf8",
    ),
  ]);

  assert.notEqual(first.rootDirectory, second.rootDirectory);
  assert.notEqual(first.projectId, second.projectId);
  assert.ok(first.portEnd < second.portStart);
  assert.equal(
    await readFile(join(first.filesDirectory, "worker.log"), "utf8"),
    "test-parallel-proof-worker-0",
  );
  assert.equal(
    await readFile(join(second.filesDirectory, "worker.log"), "utf8"),
    "test-parallel-proof-worker-1",
  );
  await rm(root, { recursive: true });
});

test("unsafe identities and overflowing port ranges fail closed", () => {
  const baseline = {
    controlledRoot,
    runId: "safe-run",
    workerIndex: 0,
    layer: "integration" as const,
  };
  assert.throws(
    () => buildTestIsolation({ ...baseline, runId: "../escape" }),
    /safe opaque identifier/u,
  );
  assert.throws(
    () => buildTestIsolation({ ...baseline, runId: "CON" }),
    /safe opaque identifier/u,
  );
  assert.throws(
    () =>
      buildTestIsolation({
        ...baseline,
        workerIndex: 2,
        basePort: 65_530,
        portsPerWorker: 4,
      }),
    /exceeds 65535/u,
  );
});

test("pre-existing non-directories cannot redirect isolation writes", async () => {
  const root = await temporaryRoot();
  await writeFile(join(root, "blocked-run"), "not a directory", "utf8");
  const isolation = buildTestIsolation({
    controlledRoot: root,
    runId: "blocked-run",
    workerIndex: 0,
    layer: "integration",
  });
  await assert.rejects(
    prepareTestIsolation(isolation),
    /non-directory link/u,
  );
  await rm(root, { recursive: true });
});

test("pre-existing directory links cannot escape the controlled root", async () => {
  const root = await temporaryRoot();
  const outside = await temporaryRoot();
  const linkedRun = join(root, "linked-run");
  await symlink(
    outside,
    linkedRun,
    process.platform === "win32" ? "junction" : "dir",
  );
  const isolation = buildTestIsolation({
    controlledRoot: root,
    runId: "linked-run",
    workerIndex: 0,
    layer: "integration",
  });
  await assert.rejects(
    prepareTestIsolation(isolation),
    /non-directory link/u,
  );
  await unlink(linkedRun);
  await Promise.all([
    rm(root, { recursive: true }),
    rm(outside, { recursive: true }),
  ]);
});

test("failure evidence retains the layer, seed, and diagnostic log", async () => {
  const root = await temporaryRoot();
  const isolation = buildTestIsolation({
    controlledRoot: root,
    runId: "failure-proof",
    workerIndex: 0,
    layer: "e2e",
  });
  await prepareTestIsolation(isolation);
  const paths = await writeFailureEvidence(isolation, {
    caseId: "export-recovery",
    layer: "e2e",
    seed: "seed-20260720-01",
    errorName: "AssertionError",
    errorMessage: "reimported hash differs",
    stack: "at export-recovery",
  });

  const manifest = JSON.parse(await readFile(paths.manifestPath, "utf8")) as unknown;
  assert.deepEqual(manifest, {
    schema_version: "0.1.0",
    case_id: "export-recovery",
    layer: "e2e",
    seed: "seed-20260720-01",
    error_name: "AssertionError",
    error_message: "reimported hash differs",
  });
  assert.equal(
    await readFile(paths.logPath, "utf8"),
    "AssertionError\nreimported hash differs\nat export-recovery\n",
  );
  await assert.rejects(
    writeFailureEvidence(isolation, {
      caseId: "export-recovery",
      layer: "e2e",
      seed: "replacement",
      errorName: "Error",
      errorMessage: "must not overwrite",
    }),
    /EEXIST/u,
  );
  await rm(root, { recursive: true });
});
