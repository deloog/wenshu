import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { restoreFromSpecificBackup } from "../backup.ts";
import { openProjectStore } from "../store.ts";
import {
  atomicWriteFile,
  recoverGrantDirectory,
  resolveGrantFile,
} from "./atomic-write.ts";
import { classifyFsError, FileBoundaryError } from "./errors.ts";
import { isImportedOriginal, type DirectoryGrant, type GrantTable } from "./grants.ts";

export type DirectorySelection =
  | { readonly status: "selected"; readonly root: string; readonly displayName: string }
  | { readonly status: "denied" }
  | { readonly status: "cancelled" };

export type CancelReason = "user" | "superseded" | "shutdown" | "deadline";

export type CapabilityOutcome =
  | { readonly kind: "success"; readonly output: Record<string, unknown> }
  | { readonly kind: "cancelled"; readonly reason: CancelReason };

export interface FileHostContext {
  readonly grants: GrantTable;
  readonly selectDirectory: (purpose?: string) => Promise<DirectorySelection>;
  readonly now: () => Date;
}

export function projectDatabasePath(root: string): string {
  return join(root, "project.sqlite");
}

export function projectBackupDirectory(root: string): string {
  return join(root, "backups");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireGrant(context: FileHostContext, grantId: unknown): DirectoryGrant {
  if (typeof grantId !== "string") {
    throw new FileBoundaryError("INVALID");
  }
  const grant = context.grants.resolve(grantId);
  if (grant === undefined) {
    throw new FileBoundaryError("NOT_FOUND");
  }
  return grant;
}

function requireWritable(grant: DirectoryGrant): void {
  if (grant.mode !== "read_write") {
    throw new FileBoundaryError("PERMISSION_DENIED");
  }
}

async function existingFileHash(target: string): Promise<string | null> {
  try {
    return sha256(await readFile(target));
  } catch (error) {
    const classified = classifyFsError(error);
    if (classified.code === "NOT_FOUND") {
      return null;
    }
    throw classified;
  }
}

interface WritePayload {
  readonly grant_id: string;
  readonly file_name: string;
  readonly content_base64: string;
  readonly content_sha256: string;
}

async function writeAtomically(
  grant: DirectoryGrant,
  input: WritePayload,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  requireWritable(grant);
  if (isImportedOriginal(grant, input.file_name)) {
    throw new FileBoundaryError("PERMISSION_DENIED");
  }
  const bytes = Buffer.from(input.content_base64, "base64");
  const digest = sha256(bytes);
  if (digest !== input.content_sha256) {
    throw new FileBoundaryError("INTEGRITY_FAILURE");
  }
  const target = resolveGrantFile(grant.root, input.file_name);
  await atomicWriteFile(target, bytes, { signal });
  return {
    grant_id: grant.id,
    file_name: input.file_name,
    sha256: digest,
    bytes_written: bytes.length,
  };
}

export async function handleDirectorySelect(
  context: FileHostContext,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<CapabilityOutcome> {
  if (signal.aborted) {
    throw new FileBoundaryError("CANCELLED");
  }
  const selection = await context.selectDirectory(
    typeof input["purpose"] === "string" ? input["purpose"] : undefined,
  );
  if (selection.status === "cancelled") {
    return { kind: "cancelled", reason: "user" };
  }
  if (selection.status === "denied") {
    throw new FileBoundaryError("PERMISSION_DENIED");
  }
  const rootStat = await stat(selection.root).catch((error: unknown) => {
    throw classifyFsError(error);
  });
  if (!rootStat.isDirectory()) {
    throw new FileBoundaryError("INVALID");
  }
  const writable = await access(selection.root, constants.W_OK)
    .then(() => true)
    .catch(() => false);
  const grant = context.grants.register(
    selection.root,
    writable ? "read_write" : "read_only",
  );
  // Grant acquisition is the crash-recovery point: residue from interrupted
  // atomic writes is removed here, never completed.
  await recoverGrantDirectory(selection.root);
  return {
    kind: "success",
    output: { grant_id: grant.id, display_name: selection.displayName },
  };
}

export async function handleDirectoryAuthorize(
  context: FileHostContext,
  input: Record<string, unknown>,
): Promise<CapabilityOutcome> {
  const grant = requireGrant(context, input["grant_id"]);
  const writable = await access(grant.root, constants.W_OK)
    .then(() => true)
    .catch(() => false);
  return {
    kind: "success",
    output: { grant_id: grant.id, mode: writable ? "read_write" : "read_only" },
  };
}

export async function handleSaveAtomic(
  context: FileHostContext,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<CapabilityOutcome> {
  const grant = requireGrant(context, input["grant_id"]);
  const payload = input as unknown as WritePayload & {
    readonly expected_previous_sha256: string | null;
  };
  const target = resolveGrantFile(grant.root, payload.file_name);
  const existing = await existingFileHash(target);
  if (payload.expected_previous_sha256 === null && existing !== null) {
    throw new FileBoundaryError("CONFLICT");
  }
  if (
    payload.expected_previous_sha256 !== null &&
    existing !== payload.expected_previous_sha256
  ) {
    throw new FileBoundaryError("CONFLICT");
  }
  return { kind: "success", output: await writeAtomically(grant, payload, signal) };
}

export async function handleSaveAs(
  context: FileHostContext,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<CapabilityOutcome> {
  const grant = requireGrant(context, input["grant_id"]);
  const payload = input as unknown as WritePayload;
  const target = resolveGrantFile(grant.root, payload.file_name);
  if ((await existingFileHash(target)) !== null) {
    throw new FileBoundaryError("CONFLICT");
  }
  return { kind: "success", output: await writeAtomically(grant, payload, signal) };
}

export async function handleExportWrite(
  context: FileHostContext,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<CapabilityOutcome> {
  const grant = requireGrant(context, input["grant_id"]);
  const payload = input as unknown as WritePayload & { readonly overwrite: boolean };
  const target = resolveGrantFile(grant.root, payload.file_name);
  if (payload.overwrite !== true && (await existingFileHash(target)) !== null) {
    throw new FileBoundaryError("CONFLICT");
  }
  return { kind: "success", output: await writeAtomically(grant, payload, signal) };
}

export async function handleBackupCreate(
  context: FileHostContext,
  input: Record<string, unknown>,
): Promise<CapabilityOutcome> {
  const grant = requireGrant(context, input["grant_id"]);
  requireWritable(grant);
  const store = await openProjectStore({
    databasePath: projectDatabasePath(grant.root),
    backupDirectory: projectBackupDirectory(grant.root),
    recover: false,
  }).catch((error: unknown) => {
    throw classifyFsError(error);
  });
  try {
    const backupPath = await store.createBackup().catch((error: unknown) => {
      throw classifyFsError(error);
    });
    const digest = sha256(await readFile(backupPath));
    return {
      kind: "success",
      output: {
        grant_id: grant.id,
        backup_id: `backup_${digest.slice(0, 32)}`,
        created_at: context.now().toISOString(),
        sha256: digest,
      },
    };
  } finally {
    store.close();
  }
}

export async function handleBackupRestore(
  context: FileHostContext,
  input: Record<string, unknown>,
): Promise<CapabilityOutcome> {
  const grant = requireGrant(context, input["grant_id"]);
  requireWritable(grant);
  const backupId = input["backup_id"];
  if (typeof backupId !== "string") {
    throw new FileBoundaryError("INVALID");
  }
  const backupDirectory = projectBackupDirectory(grant.root);
  const entries = await readdir(backupDirectory).catch((error: unknown) => {
    throw classifyFsError(error);
  });
  for (const entry of entries) {
    if (!/^backup-[0-9]{16}-[0-9a-f-]{36}\.sqlite$/u.test(entry)) {
      continue;
    }
    const candidate = join(backupDirectory, entry);
    const digest = sha256(await readFile(candidate));
    if (`backup_${digest.slice(0, 32)}` !== backupId) {
      continue;
    }
    await restoreFromSpecificBackup(projectDatabasePath(grant.root), candidate).catch(
      (error: unknown) => {
        throw classifyFsError(error);
      },
    );
    return {
      kind: "success",
      output: { grant_id: grant.id, backup_id: backupId, restored: true },
    };
  }
  throw new FileBoundaryError("NOT_FOUND");
}
