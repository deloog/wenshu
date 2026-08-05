import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { classifyFsError, FileBoundaryError } from "./errors.ts";

export type GrantMode = "read_only" | "read_write";

/**
 * A directory grant. The absolute root is held only by the host side of the
 * boundary; all the core side ever sees is the opaque grant_id.
 */
export interface DirectoryGrant {
  readonly id: string;
  readonly root: string;
  readonly mode: GrantMode;
  /** Files that originated from an external import and must not be overwritten. */
  readonly protectedFiles: ReadonlySet<string>;
}

export interface GrantTable {
  register(root: string, mode: GrantMode): DirectoryGrant;
  resolve(grantId: string): DirectoryGrant | undefined;
  revoke(grantId: string): boolean;
  /**
   * Register a single-file grant (ADR-0029 R-3): the grant pins exactly one
   * absolute file path plus its selection-time sha256/size snapshot. It never
   * implies any authorization over the containing directory.
   */
  registerFile(input: {
    readonly filePath: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  }): FileGrant;
  resolveFile(grantId: string): FileGrant | undefined;
  /**
   * Atomically take the file grant out of the table (ADR-0029 R-2,
   * consume-on-read): a second use of the same grant id finds nothing.
   */
  consumeFile(grantId: string): FileGrant | undefined;
}

/**
 * A single-file grant. The absolute path is held only by the host side of the
 * boundary; all the core side ever sees is the opaque grant_id. Session-scoped
 * (in-memory table, dies with the process) and one-shot (consumeFile).
 */
export interface FileGrant {
  readonly id: string;
  readonly kind: "file";
  readonly filePath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

/**
 * Consume a single-file grant and read its pinned path (ADR-0029 R-2/R-3).
 * The grant is revoked before reading, the read never leaves the pinned path,
 * and a content drift from the selection-time snapshot fails closed with
 * INTEGRITY_FAILURE.
 */
export async function readGrantedFile(
  grants: GrantTable,
  grantId: string,
): Promise<Uint8Array> {
  const grant = grants.consumeFile(grantId);
  if (grant === undefined) {
    throw new FileBoundaryError("NOT_FOUND");
  }
  const bytes = await readFile(grant.filePath).catch((error: unknown) => {
    throw classifyFsError(error);
  });
  if (createHash("sha256").update(bytes).digest("hex") !== grant.sha256) {
    throw new FileBoundaryError("INTEGRITY_FAILURE");
  }
  return bytes;
}

export function protectImportedFile(grant: DirectoryGrant, fileName: string): void {
  if (!isSafeFileName(fileName)) {
    throw new FileBoundaryError("INVALID");
  }
  (grant.protectedFiles as Set<string>).add(fileName);
}

export function isImportedOriginal(grant: DirectoryGrant, fileName: string): boolean {
  return grant.protectedFiles.has(fileName);
}

export function isSafeFileName(fileName: string): boolean {
  return /^(?!.*\.$)(?!CON$|PRN$|AUX$|NUL$|COM[1-9]$|LPT[1-9]$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/iu.test(
    fileName,
  );
}

export function createGrantTable(): GrantTable {
  const grants = new Map<string, DirectoryGrant>();
  const fileGrants = new Map<string, FileGrant>();
  return Object.freeze({
    register(root: string, mode: GrantMode): DirectoryGrant {
      if (!isAbsolute(root)) {
        throw new FileBoundaryError("INVALID");
      }
      const grant: DirectoryGrant = Object.freeze({
        id: `grant_${randomBytes(16).toString("hex")}`,
        root: resolve(root),
        mode,
        protectedFiles: new Set<string>(),
      });
      grants.set(grant.id, grant);
      return grant;
    },
    resolve(grantId: string): DirectoryGrant | undefined {
      return grants.get(grantId);
    },
    revoke(grantId: string): boolean {
      return grants.delete(grantId);
    },
    registerFile(input: {
      readonly filePath: string;
      readonly sha256: string;
      readonly sizeBytes: number;
    }): FileGrant {
      if (!isAbsolute(input.filePath)) {
        throw new FileBoundaryError("INVALID");
      }
      const grant: FileGrant = Object.freeze({
        id: `grant_${randomBytes(16).toString("hex")}`,
        kind: "file",
        filePath: input.filePath,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
      });
      fileGrants.set(grant.id, grant);
      return grant;
    },
    resolveFile(grantId: string): FileGrant | undefined {
      return fileGrants.get(grantId);
    },
    consumeFile(grantId: string): FileGrant | undefined {
      const grant = fileGrants.get(grantId);
      if (grant !== undefined) {
        fileGrants.delete(grantId);
      }
      return grant;
    },
  });
}
