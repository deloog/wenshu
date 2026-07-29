import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { openProjectStore, readMigrationHistory } from "../src/index.ts";

const committed = {
  id: "prj_00000000000000000000000000000001",
  title: "已提交项目",
  documentJson: JSON.stringify({ schemaVersion: "0.2.0", blocks: [] }),
};

async function isolatedPaths(
  worker: string,
): Promise<{ readonly root: string; readonly db: string; readonly backups: string }> {
  const root = await mkdtemp(join(tmpdir(), `wenshu-pb09-${worker}-`));
  return { root, db: join(root, "project.sqlite"), backups: join(root, "backups") };
}

async function withStore(
  worker: string,
  run: (paths: {
    readonly root: string;
    readonly db: string;
    readonly backups: string;
  }) => Promise<void>,
): Promise<void> {
  const paths = await isolatedPaths(worker);
  try {
    await run(paths);
  } finally {
    await rm(paths.root, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 200,
    });
  }
}

test("v0 to v1 migration is idempotent and history is append-only", async () => {
  await withStore("migration", async ({ db, backups }) => {
    const first = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
    });
    first.seedProject(committed);
    assert.equal(first.migrationHistory.length, 1);
    first.close();

    const second = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
    });
    second.seedProject(committed);
    assert.equal(second.listProjects().length, 1);
    second.close();

    const historyReader = new DatabaseSync(db, { readOnly: true });
    assert.deepEqual(second.migrationHistory, readMigrationHistory(historyReader));
    historyReader.close();

    const raw = new DatabaseSync(db);
    assert.throws(() => raw.exec("update schema_migrations set checksum = 'tampered'"));
    assert.throws(() => raw.exec("delete from schema_migrations"));
    raw.close();

    const malicious = new DatabaseSync(db);
    malicious.exec("drop trigger schema_migrations_block_update");
    malicious.exec("update schema_migrations set checksum = 'tampered'");
    malicious.close();
    await assert.rejects(
      openProjectStore({ databasePath: db, backupDirectory: backups }),
      { code: "STORAGE_MIGRATION_HISTORY_TAMPERED" },
    );
  });
});

test("migration-style strong kill rolls back uncommitted schema work without losing committed data", async () => {
  await withStore("kill", async ({ db, backups }) => {
    const store = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
    });
    store.insertProject(committed);
    store.close();

    const child = spawn(
      process.execPath,
      [
        "-e",
        `
      const { DatabaseSync } = require('node:sqlite');
      const database = new DatabaseSync(process.argv[1]);
      database.exec('begin immediate; create table interrupted_migration(value text); insert into interrupted_migration values (\\'half\\')');
      process.stdout.write('READY');
      setInterval(() => {}, 1000);
    `,
        db,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let childError = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      childError += chunk.toString("utf8");
    });
    await Promise.race([
      once(child.stdout, "data"),
      new Promise<never>((_, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`PB09_KILL_CHILD_NOT_READY ${childError}`)),
          5_000,
        );
        timeout.unref();
      }),
    ]);
    if (process.platform === "win32" && child.pid !== undefined) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
    } else {
      child.kill("SIGKILL");
    }
    if (child.exitCode === null) await once(child, "exit");

    const reopened = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
    });
    assert.deepEqual(
      reopened.listProjects().map((project) => project.id),
      [committed.id],
    );
    reopened.close();
    const raw = new DatabaseSync(db, { readOnly: true });
    assert.equal(
      raw
        .prepare(
          "select 1 as present from sqlite_master where name = 'interrupted_migration'",
        )
        .get(),
      undefined,
    );
    raw.close();
  });
});

test("corruption restores the latest SQLite backup and never treats the damaged file as truth", async () => {
  await withStore("recover", async ({ db, backups }) => {
    const store = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
    });
    store.insertProject(committed);
    await store.createBackup();
    store.close();
    await writeFile(db, "not a sqlite database");

    const recovered = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
      recover: true,
    });
    assert.notEqual(recovered.recoverySource, null);
    assert.deepEqual(
      recovered.listProjects().map((project) => project.id),
      [committed.id],
    );
    recovered.close();
    assert.equal(
      (await readFile(db)).subarray(0, 16).toString("binary"),
      "SQLite format 3\u0000",
    );
  });
});

test("real SQLite full preserves its diagnostic and committed data", async () => {
  await withStore("failure", async ({ db, backups }) => {
    const store = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
    });
    store.insertProject(committed);
    store.close();
    const capped = new DatabaseSync(db);
    const pageCount = capped.prepare("pragma page_count").get()?.["page_count"];
    if (typeof pageCount !== "number") throw new Error("PB09_PAGE_COUNT_MISSING");
    capped.close();

    const constrained = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
      maxPageCount: pageCount + 1,
    });
    let fullError: unknown;
    try {
      constrained.insertProject({
        ...committed,
        id: "prj_00000000000000000000000000000002",
        documentJson: "x".repeat(1_000_000),
      });
      assert.fail("PB09_SQLITE_FULL_EXPECTED");
    } catch (error) {
      fullError = error;
    }
    const fullMessage =
      typeof fullError === "object" && fullError !== null && "message" in fullError
        ? String(fullError.message)
        : String(fullError);
    assert.match(fullMessage, /full/i);
    assert.doesNotMatch(fullMessage, /cannot rollback|no transaction is active/i);
    constrained.close();
    const readOnly = new DatabaseSync(db, { readOnly: true });
    assert.throws(() =>
      readOnly.exec(
        "insert into projects values ('prj_00000000000000000000000000000003', 'x', '{}', '2026-01-01T00:00:00.000Z')",
      ),
    );
    readOnly.close();

    const verified = await openProjectStore({
      databasePath: db,
      backupDirectory: backups,
    });
    assert.deepEqual(
      verified.listProjects().map((project) => project.id),
      [committed.id],
    );
    verified.close();
  });
});

test("parallel workers receive different real SQLite files and never cross-write", async () => {
  const [left, right] = await Promise.all([
    isolatedPaths("worker-a"),
    isolatedPaths("worker-b"),
  ]);
  try {
    await Promise.all([
      (async () => {
        const store = await openProjectStore({
          databasePath: left.db,
          backupDirectory: left.backups,
        });
        store.insertProject({
          ...committed,
          id: "prj_0000000000000000000000000000000a",
        });
        store.close();
      })(),
      (async () => {
        const store = await openProjectStore({
          databasePath: right.db,
          backupDirectory: right.backups,
        });
        store.insertProject({
          ...committed,
          id: "prj_0000000000000000000000000000000b",
        });
        store.close();
      })(),
    ]);
    const [leftStore, rightStore] = await Promise.all([
      openProjectStore({ databasePath: left.db, backupDirectory: left.backups }),
      openProjectStore({ databasePath: right.db, backupDirectory: right.backups }),
    ]);
    assert.deepEqual(
      leftStore.listProjects().map((project) => project.id),
      ["prj_0000000000000000000000000000000a"],
    );
    assert.deepEqual(
      rightStore.listProjects().map((project) => project.id),
      ["prj_0000000000000000000000000000000b"],
    );
    leftStore.close();
    rightStore.close();
  } finally {
    await Promise.all([
      rm(left.root, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 200,
      }),
      rm(right.root, {
        recursive: true,
        force: true,
        maxRetries: 8,
        retryDelay: 200,
      }),
    ]);
  }
});
