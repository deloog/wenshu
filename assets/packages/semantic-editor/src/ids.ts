export type IdPrefix = "node" | "item" | "col" | "row" | "cell";

export interface IdAllocator {
  allocate(prefix: IdPrefix): string;
}

/** IDs are opaque random values; callers never pass document positions into it. */
export class RandomIdAllocator implements IdAllocator {
  allocate(prefix: IdPrefix): string {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
}

export function assertDistinctIds(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error("PB02_DUPLICATE_ID");
  }
}
