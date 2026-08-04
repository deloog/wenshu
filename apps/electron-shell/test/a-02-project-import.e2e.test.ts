/**
 * A-02: real-file project import E2E (task book §5 minimum evidence). Every
 * sub-scenario spawns the real Electron binary (e2e-main.cjs + the scenario
 * bundle) against real fixture files written into a fresh workdir; nothing
 * mocks the filesystem, storage, or the Host. The orchestrator only writes
 * fixtures, spawns/kills processes, and reconciles real on-disk artifacts.
 *
 * Sub-scenarios (each an independent run with its own workdir):
 *   happy+open        select -> new -> import -> open, state trajectory checked
 *   partial           one referenced asset never selected -> import-partial
 *   cancel            first progress event cancels; cancelled != failure
 *   permission-denied real read-only dir -> PERMISSION_DENIED, no path echo
 *   target-exists     D2: refuse, never merge, never rename
 *   handle-reuse      R-2 E2E counter-example: consumed handle -> NOT_FOUND
 *
 * Stop-condition-level invariant (all sub-scenarios): every source file's
 * sha256 is snapshotted before the run and byte-compared after it.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import {
  awaitExit,
  readReport,
  sha256Bytes,
  sha256File,
  spawnE2E,
  summaryOf,
  type E2EProcess,
  type SummaryLine,
} from "./pb-12-orchestrator.ts";

const execFileAsync = promisify(execFile);

/* ----------------------------------------------------------------- fixtures */

const REPORT_MD = [
  "---",
  "title: E2E 导入报告",
  "---",
  "",
  "第一段正文：真实文件导入。",
  "",
  "![图一](img1.png)",
  "",
  "![图二](img2.png)",
  "",
].join("\n");

const CANCEL_MD = [
  "---",
  "title: E2E 取消报告",
  "---",
  "",
  "取消场景正文。",
  "",
  "![图一](img1.png)",
  "",
].join("\n");

/** No figures: a clean import must end "success", not "partial". */
const REUSE_MD = [
  "---",
  "title: E2E 复用报告",
  "---",
  "",
  "handle 复用场景正文。",
  "",
].join("\n");

const PNG1_BYTES = Buffer.from("a-02 e2e image one bytes · 真实字节一\n".repeat(64));
const PNG2_BYTES = Buffer.from("a-02 e2e image two bytes · 真实字节二\n".repeat(96));

/** Deterministic 32 MiB bulk asset: widens the read window for mid-import cancel. */
function buildBulkBytes(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < size; index += 1) {
    const block = index % 8192;
    bytes[index] = (block * 31 + (block >> 5) * 17 + 7) % 256;
  }
  return bytes;
}

interface Fixture {
  readonly workdir: string;
  readonly dir: string;
  /** file name -> sha256 snapshot taken right after writing. */
  readonly sourceHashes: Readonly<Record<string, string>>;
}

async function makeFixture(
  prefix: string,
  files: Readonly<Record<string, Buffer>>,
): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const workdir = join(dir, "workdir");
  await mkdir(workdir, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(join(workdir, name), bytes);
    hashes[name] = sha256Bytes(bytes);
  }
  return { workdir, dir, sourceHashes: hashes };
}

/** Stop-condition-level hard assertion: sources are byte-identical afterwards. */
async function assertSourcesUnchanged(fixture: Fixture): Promise<void> {
  for (const [name, before] of Object.entries(fixture.sourceHashes)) {
    const after = await sha256File(join(fixture.workdir, name));
    assert.equal(after, before, `source file mutated in place: ${name}`);
  }
}

async function residueNames(workdir: string): Promise<readonly string[]> {
  return (await readdir(workdir)).filter((name) => name.includes(".wenshu-import-"));
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/* --------------------------------------------------------------- run helper */

interface SubRunResult {
  readonly proc: E2EProcess;
  readonly summary: SummaryLine;
  readonly exitCode: number | null;
}

async function spawnSub(
  fixture: Fixture,
  sub: string,
  options?: {
    readonly selectFiles?: readonly string[];
    readonly selectDirectory?: readonly string[];
    readonly reportLabel?: string;
  },
): Promise<SubRunResult> {
  const proc = spawnE2E({
    workdir: fixture.workdir,
    reportDir: join(fixture.dir, `report-${options?.reportLabel ?? sub}`),
    extraEnv: {
      E2E_SCENARIO_MODE: "project-import",
      E2E_SUB: sub,
      ...(options?.selectFiles === undefined
        ? {}
        : { E2E_SELECT_FILES: JSON.stringify(options.selectFiles) }),
      ...(options?.selectDirectory === undefined
        ? {}
        : { E2E_SELECT_DIRECTORY: JSON.stringify(options.selectDirectory) }),
    },
  });
  const exit = await awaitExit(proc, 120_000);
  const summary = summaryOf(await readReport(proc.reportPath));
  assert.equal(summary.mode, "project-import");
  assert.equal(summary.sub, sub);
  return { proc, summary, exitCode: exit.code };
}

function projectImportExtra(summary: SummaryLine): Record<string, unknown> {
  const extra = summary.projectImport;
  assert.ok(
    typeof extra === "object" && extra !== null,
    "summary missing projectImport extra",
  );
  return extra as Record<string, unknown>;
}

function assertSubPassed(run: SubRunResult): void {
  const failures = run.summary.chains
    .filter((chain) => chain.status !== "pass")
    .map((chain) => `${chain.id}: ${chain.detail}`);
  assert.equal(
    run.exitCode,
    0,
    `sub ${String(run.summary.sub)} exit ${run.exitCode}: ${failures.join("; ")}\n` +
      run.proc.stderrTail(),
  );
  assert.equal(run.summary.status, "pass", failures.join("; "));
  assert.deepEqual(failures, []);
}

/** On-disk layout reconciliation against the real bytes the orchestrator wrote. */
async function assertImportedLayout(
  fixture: Fixture,
  target: string,
  extra: Record<string, unknown>,
  expectedAssets: readonly string[],
): Promise<void> {
  const targetDir = join(fixture.workdir, target);
  const documentSha256 = extra["documentSha256"];
  assert.ok(
    typeof documentSha256 === "string" && /^[0-9a-f]{64}$/u.test(documentSha256),
    "documentSha256 missing from summary",
  );
  // documentSha256 === the digest of the real on-disk document.json.
  assert.equal(await sha256File(join(targetDir, "document.json")), documentSha256);
  // materials copy is byte-identical to the untouched source markdown.
  const materialName = extra["materialName"];
  assert.ok(typeof materialName === "string" && materialName.length > 0);
  const sourceName = Object.keys(fixture.sourceHashes).find((name) =>
    name.endsWith(".md"),
  );
  assert.ok(sourceName !== undefined, "fixture has no markdown source");
  assert.equal(materialName, `${fixture.sourceHashes[sourceName]?.slice(0, 16)}.md`);
  const materialBytes = await readFile(join(targetDir, "materials", materialName));
  assert.equal(sha256Bytes(materialBytes), fixture.sourceHashes[sourceName]);
  // Every reported imported asset exists at its content-addressed path and is
  // byte-identical to its untouched source file.
  const importedAssets = extra["importedAssets"];
  assert.ok(Array.isArray(importedAssets), "importedAssets missing");
  assert.equal(importedAssets.length, expectedAssets.length);
  const bySource = new Map(
    expectedAssets.map((name) => [
      `${fixture.sourceHashes[name]?.slice(0, 16)}.png`,
      name,
    ]),
  );
  for (const entry of importedAssets as readonly Record<string, unknown>[]) {
    const fileName = String(entry["fileName"]);
    const path = String(entry["path"]);
    const source = bySource.get(fileName);
    assert.ok(source !== undefined, `unexpected imported asset: ${fileName}`);
    assert.equal(path, `assets/${fileName}`);
    const bytes = await readFile(join(targetDir, "assets", fileName));
    assert.equal(sha256Bytes(bytes), fixture.sourceHashes[source]);
  }
}

/* -------------------------------------------------------------------- tests */

test(
  "a-02 happy+open: select -> new -> import -> open on real files",
  { timeout: 180_000 },
  async (t) => {
    const fixture = await makeFixture("wenshu-a02-happy-", {
      "report.md": Buffer.from(REPORT_MD, "utf8"),
      "img1.png": PNG1_BYTES,
      "img2.png": PNG2_BYTES,
    });
    t.after(() => rm(fixture.dir, { recursive: true, force: true }));

    const run = await spawnSub(fixture, "happy", {
      selectFiles: ["report.md", "img1.png", "img2.png"],
      selectDirectory: [".", "report-b"],
    });
    assertSubPassed(run);
    const extra = projectImportExtra(run.summary);
    assert.equal(extra["targetDirName"], "report-b");
    assert.equal(extra["emptyProjectDirName"], "report-a");
    assert.deepEqual(extra["failedAssets"], []);
    await assertImportedLayout(fixture, "report-b", extra, ["img1.png", "img2.png"]);
    // The empty project from project.new is untouched by the import (D2).
    assert.equal(await pathExists(join(fixture.workdir, "report-a")), true);
    assert.deepEqual(await readdir(join(fixture.workdir, "report-a")), []);
    assert.deepEqual(await residueNames(fixture.workdir), []);
    await assertSourcesUnchanged(fixture);
    t.diagnostic(
      `happy+open reconciled: document.json/materials/assets on disk, ` +
        `trajectory=${JSON.stringify(extra["trajectory"])}`,
    );
  },
);

test(
  "a-02 partial: an unselected referenced asset degrades item-wise",
  { timeout: 180_000 },
  async (t) => {
    const fixture = await makeFixture("wenshu-a02-partial-", {
      "report.md": Buffer.from(REPORT_MD, "utf8"),
      "img1.png": PNG1_BYTES,
      "img2.png": PNG2_BYTES,
    });
    t.after(() => rm(fixture.dir, { recursive: true, force: true }));

    // img2.png exists on disk next to the source but is never selected; R-3
    // forbids the host from widening the grant to read it anyway.
    const run = await spawnSub(fixture, "partial", {
      selectFiles: ["report.md", "img1.png"],
    });
    assertSubPassed(run);
    const extra = projectImportExtra(run.summary);
    assert.equal(extra["targetDirName"], "report-p");
    const failedAssets = extra["failedAssets"];
    assert.ok(Array.isArray(failedAssets) && failedAssets.length === 1);
    assert.deepEqual(failedAssets[0], {
      fileName: "img2.png",
      reasonCode: "asset_not_provided",
      retryable: true,
    });
    await assertImportedLayout(fixture, "report-p", extra, ["img1.png"]);
    assert.deepEqual(await residueNames(fixture.workdir), []);
    await assertSourcesUnchanged(fixture);
    t.diagnostic(
      "partial reconciled: img2.png failed item-wise (asset_not_provided, retryable)",
    );
  },
);

test(
  "a-02 cancel: first progress event cancels; cancelled is not failure",
  { timeout: 300_000 },
  async (t) => {
    let settled = false;
    for (let attempt = 1; attempt <= 2 && !settled; attempt += 1) {
      const fixture = await makeFixture("wenshu-a02-cancel-", {
        "report.md": Buffer.from(CANCEL_MD, "utf8"),
        "img1.png": PNG1_BYTES,
        "bulk.png": buildBulkBytes(32 * 1024 * 1024),
      });
      t.after(() => rm(fixture.dir, { recursive: true, force: true }));
      const run = await spawnSub(fixture, "cancel", {
        selectFiles: ["report.md", "img1.png", "bulk.png"],
        reportLabel: `cancel-a${attempt}`,
      });
      const extra =
        run.summary.projectImport !== undefined ? projectImportExtra(run.summary) : {};
      const outcome = extra["outcome"];
      if (run.summary.status === "pass" && outcome === "cancelled") {
        assertSubPassed(run);
        // No half-written target and zero temp residue after a real cancel.
        assert.equal(await pathExists(join(fixture.workdir, "report-c")), false);
        assert.deepEqual(await residueNames(fixture.workdir), []);
        await assertSourcesUnchanged(fixture);
        t.diagnostic(
          `attempt ${attempt}: cancelled mid-import (progress events=` +
            `${String(extra["progressEvents"])}), no half-write, sources unchanged`,
        );
        settled = true;
        continue;
      }
      // A scenario failure is NOT a lost window: surface it, never retry it away.
      if (outcome !== "success" && outcome !== "partial") {
        assertSubPassed(run);
        assert.fail("unreachable: assertSubPassed must have thrown");
      }
      // Window lost: the import completed before the cancel landed. That is a
      // race, not a product failure — even then there must be no residue and
      // the completed target must be fully written. Retry exactly once.
      assert.deepEqual(await residueNames(fixture.workdir), []);
      await assertSourcesUnchanged(fixture);
      t.diagnostic(
        `attempt ${attempt}: cancel window lost (outcome=${String(outcome)}); ` +
          (attempt === 1 ? "retrying once" : "no retries left"),
      );
      if (attempt === 2) {
        assert.fail("cancel window lost in both attempts");
      }
    }
  },
);

test(
  "a-02 permission-denied: real read-only dir -> PERMISSION_DENIED, no path echo",
  { timeout: 180_000 },
  async (t) => {
    const fixture = await makeFixture("wenshu-a02-perm-", {
      "report.md": Buffer.from(REPORT_MD, "utf8"),
    });
    const readonlyDir = join(fixture.workdir, "readonly-parent");
    await mkdir(readonlyDir);
    // Same pattern as project-storage's file.import.select integration test:
    // POSIX chmod; an explicit ACL deny entry on win32 (removed on restore).
    const restore =
      process.platform === "win32"
        ? await execFileAsync("icacls", [readonlyDir, "/deny", "*S-1-1-0:(W)"]).then(
            () => async () => {
              await execFileAsync("icacls", [readonlyDir, "/remove:d", "*S-1-1-0"]);
            },
          )
        : await chmod(readonlyDir, 0o555).then(() => async () => {
            await chmod(readonlyDir, 0o755);
          });
    t.after(async () => {
      await restore().catch(() => undefined);
      await rm(fixture.dir, { recursive: true, force: true });
    });
    // Honest environment probe: if this environment bypasses the write deny
    // (e.g. an elevated token), skip rather than fake the rejection.
    const probePath = join(readonlyDir, ".a02-probe");
    const bypassed = await mkdir(probePath).then(
      () => true,
      () => false,
    );
    if (bypassed) {
      await rm(probePath, { recursive: true, force: true });
      t.skip(
        "environment bypasses ACL write denies (win32 dev machine with an " +
          "elevated token); exercised for real via chmod 0o555 on ubuntu CI",
      );
      return;
    }

    const run = await spawnSub(fixture, "permission-denied", {
      selectFiles: ["report.md"],
      selectDirectory: ["readonly-parent"],
    });
    assertSubPassed(run);
    const extra = projectImportExtra(run.summary);
    assert.equal(extra["errorCode"], "PERMISSION_DENIED");
    assert.equal(extra["importAttempts"], 1, "noRetryLoop: exactly one attempt");
    assert.equal(await pathExists(join(readonlyDir, "report-d")), false);
    assert.deepEqual(await residueNames(fixture.workdir), []);
    assert.deepEqual(await residueNames(readonlyDir), []);
    await assertSourcesUnchanged(fixture);
    t.diagnostic(
      `permission-denied reconciled (${process.platform}: ` +
        `${process.platform === "win32" ? "icacls deny-write" : "chmod 0o555"})`,
    );
  },
);

test(
  "a-02 target-exists: refuse with exists/CONFLICT, never merge or rename (D2)",
  { timeout: 180_000 },
  async (t) => {
    const fixture = await makeFixture("wenshu-a02-exists-", {
      "report.md": Buffer.from(REPORT_MD, "utf8"),
    });
    t.after(() => rm(fixture.dir, { recursive: true, force: true }));

    const run = await spawnSub(fixture, "target-exists", {
      selectFiles: ["report.md"],
    });
    assertSubPassed(run);
    // The pre-created directory is untouched: still present, still empty.
    const existing = join(fixture.workdir, "report-e");
    assert.equal(await pathExists(existing), true);
    assert.deepEqual(await readdir(existing), []);
    assert.deepEqual(await residueNames(fixture.workdir), []);
    await assertSourcesUnchanged(fixture);
    t.diagnostic("target-exists reconciled: report-e left present and empty");
  },
);

test(
  "a-02 handle-reuse: consumed source handle fails closed NOT_FOUND (R-2)",
  { timeout: 180_000 },
  async (t) => {
    const fixture = await makeFixture("wenshu-a02-reuse-", {
      "report.md": Buffer.from(REUSE_MD, "utf8"),
    });
    t.after(() => rm(fixture.dir, { recursive: true, force: true }));

    const run = await spawnSub(fixture, "handle-reuse", {
      selectFiles: ["report.md"],
    });
    assertSubPassed(run);
    const extra = projectImportExtra(run.summary);
    await assertImportedLayout(fixture, "report-f", extra, []);
    // The second import never created its target, and left no temp residue.
    assert.equal(await pathExists(join(fixture.workdir, "report-f2")), false);
    assert.deepEqual(await residueNames(fixture.workdir), []);
    await assertSourcesUnchanged(fixture);
    t.diagnostic("handle-reuse reconciled: second import NOT_FOUND, zero residue");
  },
);
