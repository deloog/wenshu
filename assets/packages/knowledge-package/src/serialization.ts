import { createHash } from "node:crypto";

const textEncoder = new TextEncoder();

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry));
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Canonical JSON serialization used for all SHA-256 computations inside a
 * knowledge package. Keys are sorted at every object level; arrays keep order;
 * output is compact UTF-8 with no trailing newline.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(canonicalJsonStringify(value));
}

/**
 * Audit events are stored as newline-delimited canonical JSON. The trailing
 * newline is part of the serialized bytes so the SHA-256 is stable regardless
 * of how the reader splits lines.
 */
export function canonicalNdjsonBytes(values: readonly unknown[]): Uint8Array {
  if (values.length === 0) {
    return new Uint8Array(0);
  }
  const lines = values.map((entry) => canonicalJsonStringify(entry)).join("\n");
  return textEncoder.encode(`${lines}\n`);
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
