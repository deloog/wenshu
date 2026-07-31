import { randomBytes } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

import { FileBoundaryError } from "./errors.ts";

export type GrantMode = "read_only" | "read_write";

/**
 * A directory grant. The absolute root is held only by the host side of the
 * boundary; all the core side ever sees is the opaque grant_id.
 */
export interface DirectoryGrant {
  readonly id: string;
  readonly root: string;
  readonly mode: GrantMode;
}

export interface GrantTable {
  register(root: string, mode: GrantMode): DirectoryGrant;
  resolve(grantId: string): DirectoryGrant | undefined;
  revoke(grantId: string): boolean;
}

export function createGrantTable(): GrantTable {
  const grants = new Map<string, DirectoryGrant>();
  return Object.freeze({
    register(root: string, mode: GrantMode): DirectoryGrant {
      if (!isAbsolute(root)) {
        throw new FileBoundaryError("INVALID");
      }
      const grant: DirectoryGrant = Object.freeze({
        id: `grant_${randomBytes(16).toString("hex")}`,
        root: resolve(root),
        mode,
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
  });
}
