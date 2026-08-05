import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createGrantTable,
  FileBoundaryError,
  type GrantTable,
} from "@wenshu/project-storage";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const PNG_A = new TextEncoder().encode("png-bytes-a");
export const PNG_B = new TextEncoder().encode("png-bytes-b");

export const SOURCE_TEXT = [
  "---",
  "title: 导入测试",
  "---",
  "",
  "正文段落。",
  "",
  "![图一](images/a.png)",
  "",
  "![图二](b.png)",
].join("\n");
export const SOURCE_BYTES = new TextEncoder().encode(SOURCE_TEXT);

export interface Harness {
  readonly cleanup: () => Promise<void>;
  readonly grants: GrantTable;
  readonly projectGrantId: string;
  readonly grantRoot: string;
  readonly inbox: string;
  readonly sourcePath: string;
  readonly sourceGrantId: string;
  readonly assetGrantIds: readonly string[];
}

async function registerFileGrant(
  grants: GrantTable,
  filePath: string,
  bytes: Uint8Array,
): Promise<string> {
  return grants.registerFile({
    filePath,
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
  }).id;
}

export interface AssetFileSpec {
  readonly dir: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

const DEFAULT_ASSETS: readonly AssetFileSpec[] = [
  { dir: "images", name: "a.png", bytes: PNG_A },
  { dir: "", name: "b.png", bytes: PNG_B },
];

export async function makeHarness(options?: {
  readonly mode?: "read_only" | "read_write";
  readonly assetFiles?: readonly AssetFileSpec[];
}): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "wenshu-project-import-"));
  const grantRoot = join(root, "projects");
  const inbox = join(root, "inbox");
  await mkdir(grantRoot, { recursive: true });
  await mkdir(join(inbox, "images"), { recursive: true });
  const sourcePath = join(inbox, "report.md");
  await writeFile(sourcePath, SOURCE_BYTES);
  const grants = createGrantTable();
  const projectGrantId = grants.register(grantRoot, options?.mode ?? "read_write").id;
  const sourceGrantId = await registerFileGrant(grants, sourcePath, SOURCE_BYTES);
  const assetGrantIds: string[] = [];
  for (const asset of options?.assetFiles ?? DEFAULT_ASSETS) {
    const assetPath = join(inbox, asset.dir, asset.name);
    await writeFile(assetPath, asset.bytes);
    assetGrantIds.push(await registerFileGrant(grants, assetPath, asset.bytes));
  }
  return {
    cleanup: () => rm(root, { recursive: true, force: true }),
    grants,
    projectGrantId,
    grantRoot,
    inbox,
    sourcePath,
    sourceGrantId,
    assetGrantIds,
  };
}

export async function expectBoundaryError(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(
    run,
    (error: unknown) => error instanceof FileBoundaryError && error.code === code,
  );
}
