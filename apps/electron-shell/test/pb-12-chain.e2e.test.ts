/**
 * PB-12 W3: real end-to-end chain orchestration tests. Every chain spawns the
 * real Electron binary (e2e-main.cjs + scenario bundle), kills it with a real
 * SIGKILL where required, and reconciles real on-disk artifacts. Nothing is
 * mocked or stubbed; this file only spawns/kills/reads/asserts.
 *
 * Chains (per the PB-12 plan §W3):
 *   1. edit -> diff -> decision links all pass in one real run
 *   2. undo/redo round trip byte-identical
 *   3. on-disk artifacts hash-equal to the reported digests
 *   4. SIGKILL mid-save never leaves a partial document (3 rounds)
 *   5. SIGKILL mid-import leaves an orphan that recovery removes
 *   6. recovery end-to-end timing < 10 s to the ready marker
 *   7. knowledge package re-import round trip + tamper rejection
 */
import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { after, test } from "node:test";

import { MATERIAL_ID, MATERIAL_MARKDOWN } from "../scenario/fixture.ts";

/**
 * Deterministic kill-delay PRNG (testing-strategy: failures must be
 * replayable). The seed is injectable via PB12_KILL_SEED for hunting;
 * every run logs the seed and the delays it produced.
 */
const KILL_DELAY_SEED = Number.parseInt(
  process.env["PB12_KILL_SEED"] ?? "12648430",
  10,
);

function makeKillDelayPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
import {
  awaitExit,
  canonicalJsonBytes,
  killAndAwait,
  makeTempDir,
  readReport,
  sha256Bytes,
  sha256File,
  sleep,
  spawnE2E,
  summaryOf,
  tamperZipEntry,
  waitForFile,
  waitForReportLines,
  type SummaryLine,
} from "./pb-12-orchestrator.ts";

interface BaseRun {
  readonly dir: string;
  readonly workdir: string;
  readonly summary: SummaryLine;
}

let basePromise: Promise<BaseRun> | undefined;

/** One shared full `--e2e` run backs chains 1-3 and 7 (deterministic output). */
async function startBaseRun(): Promise<BaseRun> {
  const dir = await makeTempDir("wenshu-pb12-base-");
  const workdir = join(dir, "workdir");
  await mkdir(workdir, { recursive: true });
  const proc = spawnE2E({ workdir, reportDir: join(dir, "report") });
  const exit = await awaitExit(proc, 90_000);
  assert.equal(exit.code, 0, `base --e2e run failed: ${proc.stderrTail()}`);
  const summary = summaryOf(await readReport(proc.reportPath));
  return { dir, workdir, summary };
}

function baseRun(): Promise<BaseRun> {
  basePromise ??= startBaseRun();
  return basePromise;
}

after(async () => {
  if (basePromise !== undefined) {
    const base = await basePromise;
    await rm(base.dir, { recursive: true, force: true });
  }
});

function chainById(summary: SummaryLine, id: string) {
  const chain = summary.chains.find((entry) => entry.id === id);
  assert.ok(chain !== undefined, `chain ${id} missing from summary`);
  return chain;
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function residueNames(workdir: string): Promise<readonly string[]> {
  return (await readdir(workdir)).filter((name) => name.includes(".wenshu-import-"));
}

test("chain 1: edit/diff/decision links pass in a real Electron run", async () => {
  const base = await baseRun();
  const editChains = base.summary.chains.filter((chain) =>
    chain.id.startsWith("edit-"),
  );
  assert.equal(editChains.length, 5, "expected 5 edit chain results");
  for (const chain of editChains) {
    assert.equal(chain.status, "pass", `${chain.id}: ${chain.detail}`);
  }
  assert.equal(base.summary.mode, "e2e");
  assert.equal(base.summary.status, "pass");
});

test("chain 2: undo/redo round trip is byte-identical", async () => {
  const base = await baseRun();
  const undoRedo = chainById(base.summary, "edit-undo-redo");
  assert.equal(undoRedo.status, "pass");
  assert.match(undoRedo.detail, /byte-identical/u);
  const undoAccepted = chainById(base.summary, "edit-undo-accepted");
  assert.equal(undoAccepted.status, "pass");
  const isolation = chainById(base.summary, "edit-proposal-isolation");
  assert.equal(isolation.status, "pass");
  assert.match(isolation.detail, /byte-identical/u);
});

test("chain 3: on-disk artifacts hash-equal the reported digests", async () => {
  const base = await baseRun();
  assert.equal(
    await sha256File(join(base.workdir, "document.json")),
    base.summary.savedDocument?.sha256,
  );
  assert.equal(
    await sha256File(join(base.workdir, "knowledge-package.zip")),
    base.summary.knowledgePackage?.sha256,
  );
});

test(
  "chain 4: SIGKILL mid-save never leaves a partial document (3 rounds)",
  { timeout: 240_000 },
  async (t) => {
    const killDelayRandom = makeKillDelayPrng(KILL_DELAY_SEED);
    t.diagnostic(`kill delay seed=${KILL_DELAY_SEED} (PB12_KILL_SEED injectable)`);
    const dir = await makeTempDir("wenshu-pb12-killsave-");
    t.after(() => rm(dir, { recursive: true, force: true }));
    const workdir = join(dir, "workdir");
    await mkdir(workdir, { recursive: true });

    const seed = spawnE2E({ workdir, reportDir: join(dir, "r-seed") });
    const seedExit = await awaitExit(seed, 90_000);
    assert.equal(seedExit.code, 0, `seed run: ${seed.stderrTail()}`);
    const seedSha = summaryOf(await readReport(seed.reportPath)).savedDocument?.sha256;
    if (seedSha === undefined) assert.fail("seed run saved document digest missing");
    let previousSha = seedSha;

    for (let round = 1; round <= 3; round += 1) {
      const loop = spawnE2E({
        workdir,
        reportDir: join(dir, `r${round}-loop`),
        extraEnv: {
          E2E_SCENARIO_MODE: "save-loop",
          E2E_SAVE_LOOP_PREVIOUS_SHA256: previousSha,
        },
      });
      const lines = await waitForReportLines(
        loop.reportPath,
        (reportLines) =>
          reportLines.filter((line) => line["type"] === "save-loop").length >= 2,
        60_000,
      );
      const delay = 100 + Math.floor(killDelayRandom() * 600);
      await sleep(delay);
      const killExit = await killAndAwait(loop);
      assert.equal(
        killExit.signal,
        "SIGKILL",
        `round ${round}: expected SIGKILL, got ${JSON.stringify(killExit)}`,
      );
      t.diagnostic(
        `round ${round}: SIGKILL ${delay} ms after 2nd save-loop report ` +
          `(seed=${KILL_DELAY_SEED})`,
      );

      const versions = [
        ...new Set(
          lines
            .filter((line) => line["type"] === "save-loop")
            .map((line) => String(line["sha256"])),
        ),
      ];
      assert.equal(versions.length, 2, "save-loop must report both V1 and V2");

      const recover = spawnE2E({
        workdir,
        reportDir: join(dir, `r${round}-recover`),
        recover: true,
        extraEnv: { E2E_EXPECTED_DOC_SHA256: versions.join(",") },
      });
      const recoverExit = await awaitExit(recover, 90_000);
      assert.equal(
        recoverExit.code,
        0,
        `round ${round} recover: ${recover.stderrTail()}`,
      );
      assert.equal(summaryOf(await readReport(recover.reportPath)).status, "pass");
      const marker = JSON.parse(await readFile(recover.readyMarkerPath, "utf8")) as {
        artifacts: Record<string, string>;
      };
      const recoveredSha = marker.artifacts["document.json"];
      if (recoveredSha === undefined) {
        assert.fail(`round ${round}: ready marker document digest missing`);
      }
      assert.ok(
        versions.includes(recoveredSha),
        `round ${round}: recovered ${recoveredSha} is neither V1 nor V2 (partial write)`,
      );
      t.diagnostic(
        `round ${round}: recovered complete version ${versions.indexOf(recoveredSha) === 0 ? "V1" : "V2"}`,
      );
      previousSha = recoveredSha;
    }
  },
);

test(
  "chain 5: SIGKILL mid-import leaves an orphan that recovery removes",
  { timeout: 300_000 },
  async (t) => {
    const dir = await makeTempDir("wenshu-pb12-killimport-");
    t.after(() => rm(dir, { recursive: true, force: true }));
    const workdir = join(dir, "workdir");
    await mkdir(workdir, { recursive: true });

    const seed = spawnE2E({
      workdir,
      reportDir: join(dir, "r-seed"),
      extraEnv: { E2E_BULK_MATERIAL_MIB: "32" },
    });
    const seedExit = await awaitExit(seed, 150_000);
    assert.equal(seedExit.code, 0, `bulk seed run: ${seed.stderrTail()}`);
    const baselineSha = summaryOf(await readReport(seed.reportPath)).savedDocument
      ?.sha256;
    if (baselineSha === undefined)
      assert.fail("bulk seed saved document digest missing");

    let orphanHits = 0;
    for (let round = 1; round <= 5 && (round <= 3 || orphanHits === 0); round += 1) {
      const importing = spawnE2E({
        workdir,
        reportDir: join(dir, `r${round}-import`),
        extraEnv: {
          E2E_SCENARIO_MODE: "import",
          E2E_IMPORT_SOURCE: "knowledge-package.zip",
          E2E_IMPORT_TARGET: `importkill${round}`,
        },
      });
      await waitForFile(importing.importMarkerPath, 60_000);
      // Deterministic kill point: poll for the staging directory itself and
      // SIGKILL the moment it exists (mid-import by construction). The earlier
      // random-delay variant missed the window entirely on the faster ubuntu
      // CI runner (pre-staging work finishes at different speeds there).
      const stagingDeadline = Date.now() + 60_000;
      let orphans = await residueNames(workdir);
      while (
        orphans.length === 0 &&
        Date.now() <= stagingDeadline &&
        importing.child.exitCode === null &&
        importing.child.signalCode === null
      ) {
        await sleep(20);
        orphans = await residueNames(workdir);
      }
      if (orphans.length === 0) {
        const killExit = await killAndAwait(importing);
        t.diagnostic(
          `round ${round}: staging never appeared before kill/exit ` +
            `(signal=${killExit.signal} code=${killExit.code}), no orphan`,
        );
        continue;
      }
      const killExit = await killAndAwait(importing);
      if (killExit.signal !== "SIGKILL") {
        t.diagnostic(
          `round ${round}: import finished before kill (exit=${killExit.code})`,
        );
        continue;
      }
      orphans = await residueNames(workdir);
      if (orphans.length === 0) {
        t.diagnostic(`round ${round}: staging vanished before kill, no orphan`);
        continue;
      }
      orphanHits += 1;
      t.diagnostic(`round ${round}: orphan ${orphans.join(",")} after SIGKILL`);

      const recover = spawnE2E({
        workdir,
        reportDir: join(dir, `r${round}-recover`),
        recover: true,
        extraEnv: { E2E_EXPECTED_DOC_SHA256: baselineSha },
      });
      const recoverExit = await awaitExit(recover, 90_000);
      assert.equal(
        recoverExit.code,
        0,
        `round ${round} recover: ${recover.stderrTail()}`,
      );
      assert.equal(summaryOf(await readReport(recover.reportPath)).status, "pass");
      const marker = JSON.parse(await readFile(recover.readyMarkerPath, "utf8")) as {
        removedResidue: number;
      };
      assert.ok(
        marker.removedResidue >= 1,
        `round ${round}: recovery must remove the orphan import directory`,
      );
      assert.deepEqual(await residueNames(workdir), []);
      t.diagnostic(
        `round ${round}: recovery removed ${marker.removedResidue} residue item(s)`,
      );
    }
    assert.ok(orphanHits >= 1, "kill window never hit the import staging directory");
  },
);

test(
  "chain 6: recovery end-to-end reaches the ready marker under 10 s",
  { timeout: 180_000 },
  async (t) => {
    const killDelayRandom = makeKillDelayPrng(KILL_DELAY_SEED);
    const dir = await makeTempDir("wenshu-pb12-rectime-");
    t.after(() => rm(dir, { recursive: true, force: true }));
    const workdir = join(dir, "workdir");
    await mkdir(workdir, { recursive: true });

    const seed = spawnE2E({ workdir, reportDir: join(dir, "r-seed") });
    assert.equal((await awaitExit(seed, 90_000)).code, 0, seed.stderrTail());
    const baselineSha = summaryOf(await readReport(seed.reportPath)).savedDocument
      ?.sha256;
    if (baselineSha === undefined) assert.fail("seed saved document digest missing");

    const loop = spawnE2E({
      workdir,
      reportDir: join(dir, "r-loop"),
      extraEnv: {
        E2E_SCENARIO_MODE: "save-loop",
        E2E_SAVE_LOOP_PREVIOUS_SHA256: baselineSha,
      },
    });
    const lines = await waitForReportLines(
      loop.reportPath,
      (reportLines) =>
        reportLines.filter((line) => line["type"] === "save-loop").length >= 2,
      60_000,
    );
    await sleep(20 + Math.floor(killDelayRandom() * 60));
    assert.equal((await killAndAwait(loop)).signal, "SIGKILL");
    const versions = [
      ...new Set(
        lines
          .filter((line) => line["type"] === "save-loop")
          .map((line) => String(line["sha256"])),
      ),
    ];
    assert.equal(versions.length, 2);

    const startedAt = performance.now();
    const recover = spawnE2E({
      workdir,
      reportDir: join(dir, "r-recover"),
      recover: true,
      extraEnv: { E2E_EXPECTED_DOC_SHA256: versions.join(",") },
    });
    await waitForFile(recover.readyMarkerPath, 30_000);
    const elapsedMs = performance.now() - startedAt;
    t.diagnostic(
      `recovery end-to-end: ${elapsedMs.toFixed(1)} ms (respawn -> ready marker)`,
    );
    assert.ok(elapsedMs < 10_000, `recovery took ${elapsedMs.toFixed(0)} ms >= 10 s`);

    const marker = JSON.parse(await readFile(recover.readyMarkerPath, "utf8")) as {
      artifacts: Record<string, string>;
    };
    const recoveredSha = marker.artifacts["document.json"];
    if (recoveredSha === undefined) assert.fail("ready marker document digest missing");
    assert.ok(
      versions.includes(recoveredSha),
      "recovery point must be a complete pre-kill save version",
    );
    t.diagnostic(
      `recovery point = complete version sha256 ${recoveredSha.slice(0, 16)}…`,
    );
    assert.equal((await awaitExit(recover, 90_000)).code, 0, recover.stderrTail());
    assert.equal(summaryOf(await readReport(recover.reportPath)).status, "pass");
  },
);

test(
  "chain 7: knowledge package re-import round trip and tamper rejection",
  { timeout: 180_000 },
  async (t) => {
    const base = await baseRun();
    const dir = await makeTempDir("wenshu-pb12-reimport-");
    t.after(() => rm(dir, { recursive: true, force: true }));
    const workdir = join(dir, "workdir");
    await mkdir(workdir, { recursive: true });
    await copyFile(
      join(base.workdir, "knowledge-package.zip"),
      join(workdir, "knowledge-package.zip"),
    );
    const documentText = await readFile(join(base.workdir, "document.json"), "utf8");
    await writeFile(join(workdir, "document.json"), documentText);

    // 7a: clean re-import of the real on-disk package.
    const expectedDocSha = sha256Bytes(canonicalJsonBytes(JSON.parse(documentText)));
    const importing = spawnE2E({
      workdir,
      reportDir: join(dir, "r-import"),
      extraEnv: {
        E2E_SCENARIO_MODE: "import",
        E2E_IMPORT_SOURCE: "knowledge-package.zip",
        E2E_IMPORT_TARGET: "reimported",
        E2E_IMPORT_EXPECTED_DOC_SHA256: expectedDocSha,
      },
    });
    assert.equal((await awaitExit(importing, 90_000)).code, 0, importing.stderrTail());
    const importSummary = summaryOf(await readReport(importing.reportPath));
    assert.equal(importSummary.status, "pass");
    const imported = importSummary.imported;
    assert.ok(imported !== null && imported !== undefined, "import result missing");
    const manifest = base.summary.knowledgePackage?.manifestSummary;
    assert.ok(manifest !== undefined);
    assert.equal(imported["package_id"], manifest["package_id"]);
    assert.equal(imported["audit_event_count"], manifest["audit_event_count"]);
    assert.equal(imported["material_count"], 1);
    assert.match(String(imported["project_id"]), /^prj_e2e1[0-9a-f]{28}$/u);

    const truthDoc = await readFile(join(workdir, "reimported/truth/document.json"));
    assert.equal(sha256Bytes(truthDoc), imported["document_sha256"]);
    assert.equal(imported["document_sha256"], expectedDocSha);
    assert.deepEqual(JSON.parse(truthDoc.toString("utf8")), JSON.parse(documentText));
    const material = await readFile(
      join(workdir, `reimported/truth/materials/${MATERIAL_ID}.md`),
    );
    assert.equal(material.toString("utf8"), MATERIAL_MARKDOWN);
    t.diagnostic(
      "clean re-import reconciled: ids, counts, document and material bytes",
    );

    // 7b: one flipped payload byte (valid zip/CRCs) must hit the hash layer.
    const zipBytes = await readFile(join(workdir, "knowledge-package.zip"));
    await writeFile(
      join(workdir, "tampered.zip"),
      tamperZipEntry(zipBytes, "truth/document.json"),
    );
    const rejected = spawnE2E({
      workdir,
      reportDir: join(dir, "r-tampered"),
      extraEnv: {
        E2E_SCENARIO_MODE: "import",
        E2E_IMPORT_SOURCE: "tampered.zip",
        E2E_IMPORT_TARGET: "tampered-target",
      },
    });
    assert.equal((await awaitExit(rejected, 90_000)).code, 1, rejected.stderrTail());
    const rejectSummary = summaryOf(await readReport(rejected.reportPath));
    assert.equal(rejectSummary.status, "fail");
    const importChain = chainById(rejectSummary, "knowledge-import");
    assert.equal(importChain.status, "fail");
    assert.match(importChain.detail, /PACKAGE_HASH_MISMATCH/u);
    assert.equal(await pathExists(join(workdir, "tampered-target")), false);
    assert.deepEqual(await residueNames(workdir), []);
    t.diagnostic(
      "tampered package rejected with PACKAGE_HASH_MISMATCH; target never created",
    );
  },
);
