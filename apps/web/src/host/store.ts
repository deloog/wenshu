import { BrowserHostError } from "./errors.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export interface DirectoryGrant {
  readonly id: string;
  readonly files: Map<string, Uint8Array>;
  readonly backups: Map<string, Uint8Array>;
  readonly displayName: string;
}

export function newGrantId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `grant_${[...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function base64Decode(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/gu, ""));
  const out = new Uint8Array(binary.length);
  let index = 0;
  for (const code of binary) {
    out[index] = code.charCodeAt(0);
    index += 1;
  }
  return out;
}

export async function readBytes(input: Record<string, unknown>): Promise<{
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly sha: string;
}> {
  const fileName = String(input["file_name"]);
  const bytes = base64Decode(String(input["content_base64"]));
  const declaredSha = String(input["content_sha256"]);
  if ((await sha256(bytes)) !== declaredSha) {
    throw new BrowserHostError("INTEGRITY_FAILURE");
  }
  return { bytes, fileName, sha: declaredSha };
}

export async function handleSaveAtomic(
  grant: DirectoryGrant,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { bytes, fileName, sha } = await readBytes(input);
  const exists = grant.files.has(fileName);
  const expected = input["expected_previous_sha256"];
  if (expected === null && exists) {
    throw new BrowserHostError("CONFLICT");
  }
  if (expected !== null) {
    const current = grant.files.get(fileName);
    if (current === undefined || (await sha256(current)) !== expected) {
      throw new BrowserHostError("CONFLICT");
    }
  }
  grant.files.set(fileName, bytes);
  return saveOutput(grant.id, fileName, bytes, sha);
}

export async function handleSaveAs(
  grant: DirectoryGrant,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { bytes, fileName, sha } = await readBytes(input);
  if (grant.files.has(fileName)) {
    throw new BrowserHostError("CONFLICT");
  }
  grant.files.set(fileName, bytes);
  return saveOutput(grant.id, fileName, bytes, sha);
}

export async function handleExportWrite(
  grant: DirectoryGrant,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { bytes, fileName, sha } = await readBytes(input);
  const overwrite = input["overwrite"] === true;
  if (!overwrite && grant.files.has(fileName)) {
    throw new BrowserHostError("CONFLICT");
  }
  grant.files.set(fileName, bytes);
  return saveOutput(grant.id, fileName, bytes, sha);
}

function saveOutput(
  grantId: string,
  fileName: string,
  bytes: Uint8Array,
  sha: string,
): Record<string, unknown> {
  return {
    kind: "success",
    output: {
      grant_id: grantId,
      file_name: fileName,
      sha256: sha,
      bytes_written: bytes.length,
    },
  };
}

interface Snapshot {
  readonly version: 1;
  readonly files: Record<string, string>;
}

async function serializeSnapshot(files: Map<string, Uint8Array>): Promise<Uint8Array> {
  const entries = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const snapshot: Snapshot = { version: 1, files: {} };
  for (const [name, bytes] of entries) {
    snapshot.files[name] = base64Encode(bytes);
  }
  return encoder.encode(JSON.stringify(snapshot));
}

export async function handleBackupCreate(
  grant: DirectoryGrant,
  now: Date,
): Promise<Record<string, unknown>> {
  const snapshot = await serializeSnapshot(grant.files);
  const digest = await sha256(snapshot);
  const backupId = digest.slice(0, 32);
  grant.backups.set(backupId, snapshot);
  return {
    kind: "success",
    output: {
      grant_id: grant.id,
      backup_id: `backup_${backupId}`,
      created_at: now.toISOString(),
      sha256: digest,
    },
  };
}

export async function handleBackupRestore(
  grant: DirectoryGrant,
  backupId: string,
): Promise<Record<string, unknown>> {
  const shortDigest = backupId.replace(/^backup_/u, "");
  const manifest = grant.backups.get(shortDigest);
  if (manifest === undefined) {
    throw new BrowserHostError("NOT_FOUND");
  }
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(decoder.decode(manifest));
  } catch {
    throw new BrowserHostError("INTEGRITY_FAILURE");
  }
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    (snapshot as Record<string, unknown>)["version"] !== 1 ||
    typeof (snapshot as Record<string, unknown>)["files"] !== "object" ||
    (snapshot as Record<string, unknown>)["files"] === null
  ) {
    throw new BrowserHostError("INTEGRITY_FAILURE");
  }
  const restoredFiles = new Map<string, Uint8Array>();
  for (const [name, encoded] of Object.entries((snapshot as Snapshot).files)) {
    if (typeof encoded !== "string") {
      throw new BrowserHostError("INTEGRITY_FAILURE");
    }
    restoredFiles.set(name, base64Decode(encoded));
  }
  grant.files.clear();
  for (const [name, bytes] of restoredFiles) {
    grant.files.set(name, bytes);
  }
  return {
    kind: "success",
    output: { grant_id: grant.id, backup_id: backupId, restored: true },
  };
}
