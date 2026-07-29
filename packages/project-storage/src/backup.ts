import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { backup, DatabaseSync } from "node:sqlite";
import { basename, join } from "node:path";

export class StorageRecoveryError extends Error {
  readonly code: "STORAGE_BACKUP_UNAVAILABLE" | "STORAGE_RECOVERY_FAILED";

  constructor(
    code: "STORAGE_BACKUP_UNAVAILABLE" | "STORAGE_RECOVERY_FAILED",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.code = code;
  }
}

function backupName(): string {
  return `backup-${Date.now().toString().padStart(16, "0")}-${randomUUID()}.sqlite`;
}

export async function createBackup(
  database: DatabaseSync,
  backupDirectory: string,
): Promise<string> {
  await mkdir(backupDirectory, { recursive: true });
  const destination = join(backupDirectory, backupName());
  await backup(database, destination);
  return destination;
}

export async function newestBackup(backupDirectory: string): Promise<string> {
  let entries: readonly string[];
  try {
    entries = await readdir(backupDirectory);
  } catch {
    throw new StorageRecoveryError("STORAGE_BACKUP_UNAVAILABLE");
  }
  const candidates = await Promise.all(
    entries
      .filter((entry) => /^backup-[0-9]{16}-[0-9a-f-]{36}\.sqlite$/u.test(entry))
      .map(async (entry) => {
        const path = join(backupDirectory, entry);
        return { path, modifiedAt: (await stat(path)).mtimeMs };
      }),
  );
  const latest = candidates.sort(
    (left, right) => right.modifiedAt - left.modifiedAt,
  )[0];
  if (latest === undefined)
    throw new StorageRecoveryError("STORAGE_BACKUP_UNAVAILABLE");
  return latest.path;
}

export async function restoreFromBackup(
  databasePath: string,
  backupDirectory: string,
): Promise<string> {
  const source = await newestBackup(backupDirectory);
  const quarantinePath = `${databasePath}.corrupt-${Date.now()}-${randomUUID()}`;
  try {
    await rename(databasePath, quarantinePath);
    const sourceDatabase = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(sourceDatabase, databasePath);
    } finally {
      sourceDatabase.close();
    }
    return basename(source);
  } catch (error) {
    throw new StorageRecoveryError("STORAGE_RECOVERY_FAILED", { cause: error });
  }
}
