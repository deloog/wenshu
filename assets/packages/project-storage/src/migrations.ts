import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface AppliedMigration {
  readonly version: number;
  readonly migrationId: string;
  readonly checksum: string;
}

interface MigrationDefinition extends AppliedMigration {
  readonly apply: (database: DatabaseSync) => void;
}

export class StorageMigrationError extends Error {
  readonly code: "STORAGE_MIGRATION_HISTORY_TAMPERED" | "STORAGE_MIGRATION_FAILED";

  constructor(
    code: "STORAGE_MIGRATION_HISTORY_TAMPERED" | "STORAGE_MIGRATION_FAILED",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.code = code;
  }
}

const migrationSql = `
  create table projects (
    id text primary key,
    title text not null,
    document_json text not null,
    committed_at text not null
  );
`;

const checksum = createHash("sha256").update(migrationSql).digest("hex");

const migrations: readonly MigrationDefinition[] = Object.freeze([
  Object.freeze({
    version: 1,
    migrationId: "pb09-projects-v1",
    checksum,
    apply(database: DatabaseSync) {
      database.exec(migrationSql);
    },
  }),
]);

function hasTable(database: DatabaseSync, tableName: string): boolean {
  const row = database
    .prepare("select 1 as present from sqlite_master where type = 'table' and name = ?")
    .get(tableName);
  return row?.["present"] === 1;
}

function hasHistoryTriggers(database: DatabaseSync): boolean {
  const names = database
    .prepare(
      "select name from sqlite_master where type = 'trigger' and tbl_name = 'schema_migrations'",
    )
    .all()
    .map((row) => row["name"])
    .filter((name): name is string => typeof name === "string");
  return (
    names.includes("schema_migrations_block_update") &&
    names.includes("schema_migrations_block_delete")
  );
}

function createMigrationHistory(database: DatabaseSync): void {
  database.exec(`
    create table schema_migrations (
      version integer primary key,
      migration_id text not null unique,
      checksum text not null,
      applied_at text not null
    );
    create trigger schema_migrations_block_update
      before update on schema_migrations
      begin select raise(abort, 'STORAGE_MIGRATION_HISTORY_IMMUTABLE'); end;
    create trigger schema_migrations_block_delete
      before delete on schema_migrations
      begin select raise(abort, 'STORAGE_MIGRATION_HISTORY_IMMUTABLE'); end;
  `);
}

export function readMigrationHistory(
  database: DatabaseSync,
): readonly AppliedMigration[] {
  if (!hasTable(database, "schema_migrations")) return Object.freeze([]);
  return Object.freeze(
    database
      .prepare(
        "select version, migration_id, checksum from schema_migrations order by version asc",
      )
      .all()
      .map((row) => {
        const version = row["version"];
        const migrationId = row["migration_id"];
        const rowChecksum = row["checksum"];
        if (
          typeof version !== "number" ||
          typeof migrationId !== "string" ||
          typeof rowChecksum !== "string"
        ) {
          throw new StorageMigrationError("STORAGE_MIGRATION_HISTORY_TAMPERED");
        }
        return Object.freeze({ version, migrationId, checksum: rowChecksum });
      }),
  );
}

function verifyHistory(database: DatabaseSync): readonly AppliedMigration[] {
  if (!hasHistoryTriggers(database)) {
    throw new StorageMigrationError("STORAGE_MIGRATION_HISTORY_TAMPERED");
  }
  const history = readMigrationHistory(database);
  for (const applied of history) {
    const expected = migrations.find(
      (migration) => migration.version === applied.version,
    );
    if (
      expected === undefined ||
      expected.migrationId !== applied.migrationId ||
      expected.checksum !== applied.checksum
    ) {
      throw new StorageMigrationError("STORAGE_MIGRATION_HISTORY_TAMPERED");
    }
  }
  return history;
}

export function migrateV0ToV1(
  database: DatabaseSync,
  appliedAt: string,
): readonly AppliedMigration[] {
  try {
    database.exec("begin immediate");
    if (!hasTable(database, "schema_migrations")) createMigrationHistory(database);
    const existing = verifyHistory(database);
    const appliedVersions = new Set(existing.map((migration) => migration.version));
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      migration.apply(database);
      database
        .prepare(
          "insert into schema_migrations(version, migration_id, checksum, applied_at) values (?, ?, ?, ?)",
        )
        .run(migration.version, migration.migrationId, migration.checksum, appliedAt);
    }
    database.exec("pragma user_version = 1; commit");
    return readMigrationHistory(database);
  } catch (error) {
    try {
      database.exec("rollback");
    } catch {
      // A failed BEGIN has no active transaction to roll back.
    }
    if (error instanceof StorageMigrationError) throw error;
    throw new StorageMigrationError("STORAGE_MIGRATION_FAILED");
  }
}
