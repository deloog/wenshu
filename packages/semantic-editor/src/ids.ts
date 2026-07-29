import { randomBytes } from "node:crypto";

export type IdPrefix = "node" | "item" | "col" | "row" | "cell";

export interface IdAllocator {
  allocate(prefix: IdPrefix): string;
}

/** IDs are opaque random values; callers never pass document positions into it. */
export class RandomIdAllocator implements IdAllocator {
  allocate(prefix: IdPrefix): string {
    return `${prefix}_${randomBytes(16).toString("hex")}`;
  }
}

export function assertDistinctIds(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error("PB02_DUPLICATE_ID");
  }
}
