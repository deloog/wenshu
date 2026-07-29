import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createBackup, restoreFromBackup } from "./backup.ts";
import {
  migrateV0ToV1,
  readMigrationHistory,
  StorageMigrationError,
  type AppliedMigration,
} from "./migrations.ts";

export interface ProjectStoreOptions {
  readonly databasePath: string;
  readonly backupDirectory: string;
  readonly recover?: boolean;
  /** SQLite 的页面上限，用于受控配额和真实 SQLITE_FULL 降级验证。 */
  readonly maxPageCount?: number;
  readonly now?: () => string;
}

export interface ProjectSeed {
  readonly id: string;
  readonly title: string;
  readonly documentJson: string;
}

export interface StoredProject extends ProjectSeed {
  readonly committedAt: string;
}

export interface ProjectStore {
  readonly migrationHistory: readonly AppliedMigration[];
  readonly recoverySource: string | null;
  listProjects(): readonly StoredProject[];
  insertProject(seed: ProjectSeed): void;
  seedProject(seed: ProjectSeed): void;
  createBackup(): Promise<string>;
  close(): void;
}

export class StorageOpenError extends Error {
  readonly code:
    | "STORAGE_INTEGRITY_FAILED"
    | "STORAGE_MIGRATION_HISTORY_TAMPERED"
    | "STORAGE_OPEN_FAILED";

  constructor(
    code:
      | "STORAGE_INTEGRITY_FAILED"
      | "STORAGE_MIGRATION_HISTORY_TAMPERED"
      | "STORAGE_OPEN_FAILED",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.code = code;
  }
}

function verifyIntegrity(database: DatabaseSync): void {
  const row = database.prepare("pragma integrity_check").get();
  if (row?.["integrity_check"] !== "ok") {
    throw new StorageOpenError("STORAGE_INTEGRITY_FAILED");
  }
}

function configure(database: DatabaseSync, maxPageCount: number | undefined): void {
  database.enableDefensive(true);
  database.exec(
    "pragma foreign_keys = on; pragma journal_mode = wal; pragma busy_timeout = 1000",
  );
  if (maxPageCount !== undefined) {
    if (!Number.isInteger(maxPageCount) || maxPageCount < 1) {
      throw new StorageOpenError("STORAGE_OPEN_FAILED");
    }
    database.exec(`pragma max_page_count = ${maxPageCount}`);
  }
}

async function openOnce(
  options: ProjectStoreOptions,
  recoverySource: string | null,
): Promise<ProjectStore> {
  await mkdir(dirname(options.databasePath), { recursive: true });
  await mkdir(options.backupDirectory, { recursive: true });
  const existed = existsSync(options.databasePath);
  const database = new DatabaseSync(options.databasePath);
  try {
    configure(database, options.maxPageCount);
    verifyIntegrity(database);
    if (existed && (await stat(options.databasePath)).size > 0) {
      await createBackup(database, options.backupDirectory);
    }
    const migrationHistory = migrateV0ToV1(
      database,
      (options.now ?? (() => new Date().toISOString()))(),
    );
    await createBackup(database, options.backupDirectory);
    return new SqliteProjectStore(
      database,
      options.backupDirectory,
      migrationHistory,
      recoverySource,
      options.now,
    );
  } catch (error) {
    database.close();
    if (error instanceof StorageOpenError) throw error;
    if (error instanceof StorageMigrationError) {
      const code =
        error.code === "STORAGE_MIGRATION_HISTORY_TAMPERED"
          ? "STORAGE_MIGRATION_HISTORY_TAMPERED"
          : "STORAGE_OPEN_FAILED";
      throw new StorageOpenError(code, { cause: error });
    }
    throw new StorageOpenError("STORAGE_OPEN_FAILED", { cause: error });
  }
}

export async function openProjectStore(
  options: ProjectStoreOptions,
): Promise<ProjectStore> {
  try {
    return await openOnce(options, null);
  } catch (error) {
    if (options.recover !== true || !existsSync(options.databasePath)) throw error;
    const recoverySource = await restoreFromBackup(
      options.databasePath,
      options.backupDirectory,
    );
    return openOnce({ ...options, recover: false }, recoverySource);
  }
}

class SqliteProjectStore implements ProjectStore {
  private readonly database: DatabaseSync;
  private readonly backupDirectory: string;
  readonly migrationHistory: readonly AppliedMigration[];
  readonly recoverySource: string | null;
  private readonly now: (() => string) | undefined;

  constructor(
    database: DatabaseSync,
    backupDirectory: string,
    migrationHistory: readonly AppliedMigration[],
    recoverySource: string | null,
    now: (() => string) | undefined,
  ) {
    this.database = database;
    this.backupDirectory = backupDirectory;
    this.migrationHistory = migrationHistory;
    this.recoverySource = recoverySource;
    this.now = now;
  }

  listProjects(): readonly StoredProject[] {
    return Object.freeze(
      this.database
        .prepare(
          "select id, title, document_json, committed_at from projects order by id asc",
        )
        .all()
        .map((row) => {
          const id = row["id"];
          const title = row["title"];
          const documentJson = row["document_json"];
          const committedAt = row["committed_at"];
          if (
            typeof id !== "string" ||
            typeof title !== "string" ||
            typeof documentJson !== "string" ||
            typeof committedAt !== "string"
          ) {
            throw new StorageOpenError("STORAGE_INTEGRITY_FAILED");
          }
          return Object.freeze({ id, title, documentJson, committedAt });
        }),
    );
  }

  insertProject(seed: ProjectSeed): void {
    this.writeProject(seed, false);
  }

  seedProject(seed: ProjectSeed): void {
    this.writeProject(seed, true);
  }

  async createBackup(): Promise<string> {
    return createBackup(this.database, this.backupDirectory);
  }

  close(): void {
    this.database.close();
  }

  private writeProject(seed: ProjectSeed, ignoreDuplicate: boolean): void {
    const sql = ignoreDuplicate
      ? "insert or ignore into projects(id, title, document_json, committed_at) values (?, ?, ?, ?)"
      : "insert into projects(id, title, document_json, committed_at) values (?, ?, ?, ?)";
    this.database.exec("begin immediate");
    try {
      this.database
        .prepare(sql)
        .run(
          seed.id,
          seed.title,
          seed.documentJson,
          (this.now ?? (() => new Date().toISOString()))(),
        );
      this.database.exec("commit");
    } catch (error) {
      try {
        this.database.exec("rollback");
      } catch {
        // SQLite can auto-rollback a failed commit (for example, SQLITE_FULL).
      }
      throw error;
    }
  }
}

export { readMigrationHistory };
