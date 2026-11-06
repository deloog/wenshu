import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createFileHost,
  type DirectorySelection,
  type FileHost,
  type FileHostOptions,
} from "../src/index.ts";

export async function isolatedRoot(worker: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `wenshu-pb10-${worker}-`));
}

export async function withIsolatedRoot(
  worker: string,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await isolatedRoot(worker);
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function base64Of(content: string): string {
  return Buffer.from(content, "utf8").toString("base64");
}

let requestCounter = 0;

export function nextRequestId(): string {
  requestCounter += 1;
  return `req_${String(requestCounter).padStart(32, "0")}`;
}

export function createTestHost(
  root: string,
  overrides?: Partial<FileHostOptions>,
): FileHost {
  const selectDirectory =
    overrides?.selectDirectory ??
    ((): Promise<DirectorySelection> =>
      Promise.resolve({ status: "selected", root, displayName: "isolated-root" }));
  return createFileHost({
    hostKind: "electron",
    hostVersion: "pb10-test-1.0",
    instanceId: "host_10101010101010101010101010101010",
    ...overrides,
    selectDirectory,
  });
}

export function saveRequest(
  grantId: string,
  fileName: string,
  content: string,
  expectedPreviousSha256: string | null,
): Record<string, unknown> {
  return {
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextRequestId(),
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: fileName,
      content_base64: base64Of(content),
      content_sha256: sha256(content),
      expected_previous_sha256: expectedPreviousSha256,
    },
  };
}

export async function selectGrant(
  host: FileHost,
  purpose?: string,
): Promise<Record<string, unknown>> {
  const response = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextRequestId(),
    capability: "project.directory.select",
    capability_version: "0.2.0",
    input: purpose === undefined ? {} : { purpose },
  })) as Record<string, unknown>;
  if (response["kind"] !== "success") {
    throw new Error(`select failed: ${JSON.stringify(response)}`);
  }
  return response["output"] as Record<string, unknown>;
}
