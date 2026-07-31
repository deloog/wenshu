import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { classifyFsError, FileBoundaryError } from "./errors.ts";

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export const TEMP_FILE_PREFIX = ".wenshu-tmp-";

/**
 * Resolves a core-supplied safe file name inside a grant root. Structural
 * escape is impossible by construction and re-verified after resolution;
 * any surprise fails closed.
 */
export function resolveGrantFile(grantRoot: string, fileName: string): string {
  if (!SAFE_FILE_NAME.test(fileName)) {
    throw new FileBoundaryError("INVALID");
  }
  const root = resolve(grantRoot);
  const target = resolve(join(root, fileName));
  if (dirname(target) !== root) {
    throw new FileBoundaryError("INVALID");
  }
  return target;
}

export type AtomicWritePhase =
  | "temp-created"
  | "data-written-partial"
  | "data-written"
  | "data-fsynced"
  | "renamed"
  | "dir-fsynced"
  | "dir-fsync-unsupported";

export interface AtomicWriteOptions {
  /** Crash-test instrumentation: reports real progress between real file-system steps. */
  readonly onPhase?: (phase: AtomicWritePhase) => void;
  readonly signal?: AbortSignal;
}

export interface AtomicWriteResult {
  readonly directoryFsync: "performed" | "unsupported_platform";
}

const WRITE_CHUNK_BYTES = 8 * 1024 * 1024;

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new FileBoundaryError("CANCELLED");
  }
}

/**
 * True atomic write: same-volume temp file -> data fsync -> rename -> parent
 * directory fsync. No crash point can surface a partial write as success:
 * the target only ever appears via an atomic rename of a fully fsynced file.
 *
 * Platform note: Windows cannot fsync a directory handle (EPERM). There the
 * rename itself is atomic on NTFS and directory-metadata durability is
 * delegated to the OS journal; this is reported honestly in the result.
 */
export async function atomicWriteFile(
  targetPath: string,
  bytes: Uint8Array,
  options?: AtomicWriteOptions,
): Promise<AtomicWriteResult> {
  const directory = dirname(targetPath);
  const tempPath = join(directory, `${TEMP_FILE_PREFIX}${randomUUID()}`);
  const signal = options?.signal;
  throwIfCancelled(signal);

  let handle;
  try {
    await mkdir(directory, { recursive: true });
    handle = await open(tempPath, "wx");
  } catch (error) {
    throw classifyFsError(error);
  }

  try {
    options?.onPhase?.("temp-created");
    throwIfCancelled(signal);
    let offset = 0;
    while (offset < bytes.length) {
      const chunk = bytes.subarray(offset, offset + WRITE_CHUNK_BYTES);
      const written = await handle.write(chunk);
      if (written.bytesWritten !== chunk.length) {
        throw new FileBoundaryError("IO_FAILURE");
      }
      offset += written.bytesWritten;
      options?.onPhase?.("data-written-partial");
      throwIfCancelled(signal);
    }
    options?.onPhase?.("data-written");
    await handle.sync();
    options?.onPhase?.("data-fsynced");
    await handle.close();
    handle = undefined;
    throwIfCancelled(signal);
    await rename(tempPath, targetPath);
    options?.onPhase?.("renamed");
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw classifyFsError(error);
  }

  try {
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    options?.onPhase?.("dir-fsynced");
    return Object.freeze({ directoryFsync: "performed" });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null
        ? Object.getOwnPropertyDescriptor(error, "code")?.value
        : undefined;
    if (process.platform === "win32" && (code === "EPERM" || code === "EISDIR")) {
      options?.onPhase?.("dir-fsync-unsupported");
      return Object.freeze({ directoryFsync: "unsupported_platform" });
    }
    throw classifyFsError(error);
  }
}

export interface RecoveryResult {
  readonly removedResidue: number;
}

/**
 * Crash recovery for a grant directory: interrupted atomic writes only ever
 * leave temp residue; the real artifact is either the previous complete file
 * or the new complete file. Residue is removed, never completed.
 */
export async function recoverGrantDirectory(root: string): Promise<RecoveryResult> {
  let entries: readonly string[];
  try {
    entries = await readdir(root);
  } catch (error) {
    throw classifyFsError(error);
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.startsWith(TEMP_FILE_PREFIX)) {
      continue;
    }
    await rm(join(root, entry), { force: true, recursive: true }).catch(
      (error: unknown) => {
        throw classifyFsError(error);
      },
    );
    removed += 1;
  }
  return Object.freeze({ removedResidue: removed });
}
