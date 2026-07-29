import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("real SQLite persists a migrated near-real document and rejects a competing writer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wenshu-pb08-"));
  const path = join(directory, "project.sqlite");
  try {
    const first = new DatabaseSync(path);
    const version = first.prepare("select sqlite_version() as version").get()?.[
      "version"
    ];
    if (typeof version !== "string") throw new Error("PB08_SQLITE_VERSION_MISSING");
    assert.match(version, /^3\./u);
    first.exec(
      "create table migrations(version integer primary key); insert into migrations values(1); create table documents(id text primary key, body text not null)",
    );
    const body = "中文专业分析段落。".repeat(60_000);
    first
      .prepare("insert into documents values (?, ?)")
      .run("doc_00000000000000000000000000000001", body);
    const initialSize = first
      .prepare("select length(body) as size from documents")
      .get()?.["size"];
    assert.equal(initialSize, body.length);
    const second = new DatabaseSync(path);
    second.exec("pragma busy_timeout = 50");
    first.exec("begin exclusive");
    assert.throws(() => second.exec("insert into migrations values(2)"));
    first.exec("rollback");
    second.exec("alter table documents add column revision integer not null default 0");
    second.exec("insert into migrations values(2)");
    first.close();
    second.close();
    const file = await readFile(path);
    assert.equal(file.subarray(0, 16).toString("binary"), "SQLite format 3\u0000");
    assert.ok(file.byteLength > body.length / 2);
    const reopened = new DatabaseSync(path, { open: true });
    const migrationTotal = reopened
      .prepare("select count(*) as total from migrations")
      .get()?.["total"];
    assert.equal(migrationTotal, 2);
    const reopenedSize = reopened
      .prepare("select length(body) as size from documents")
      .get()?.["size"];
    assert.equal(reopenedSize, body.length);
    assert.deepEqual(
      reopened
        .prepare("pragma table_info(documents)")
        .all()
        .map((column) => column["name"]),
      ["id", "body", "revision"],
    );
    reopened.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
