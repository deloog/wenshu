import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

import {
  buildContentAddressedAsset,
  validateAssetReference,
} from "./asset-resolution.ts";
import type { ResolvedAsset } from "./document.ts";
import { MarkdownImportError } from "./errors.ts";
import { importCore } from "./import-from-text.ts";
import type { ImportResult } from "./types.ts";

async function resolveAsset(
  sourcePath: string,
  reference: string,
): Promise<{ asset: ResolvedAsset; bytes: Uint8Array }> {
  validateAssetReference(reference);
  const absolute = posix.join(dirname(sourcePath), reference);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(absolute);
  } catch {
    throw new MarkdownImportError(
      "IMPORT_ASSET_INVALID",
      "referenced asset cannot be read",
    );
  }
  return { asset: buildContentAddressedAsset(reference, bytes), bytes };
}

export async function importMarkdownDocument(
  sourcePath: string,
  importRoot: string,
): Promise<ImportResult> {
  // 决策 #9：导入根为调用方显式声明的公共目录（必填），源文件必须位于根内。
  const relativeSource = relative(resolve(importRoot), resolve(sourcePath));
  if (
    relativeSource === "" ||
    relativeSource === ".." ||
    relativeSource.startsWith(`..${sep}`) ||
    isAbsolute(relativeSource)
  ) {
    throw new MarkdownImportError(
      "IMPORT_ROOT_INVALID",
      "source file must reside inside the declared import root",
    );
  }
  const documentNamespace = relativeSource.split(sep).join(posix.sep);
  const source = await readFile(sourcePath, "utf8");
  // 与文本入口共用同一解析核心；此入口任一资源失败即整单抛错
  // （all-or-nothing），靠回调直接抛错保持既有行为逐字节不变。
  const result = await importCore({
    source,
    documentNamespace,
    resolveFigureAsset: async (reference) => {
      const { asset } = await resolveAsset(sourcePath, reference);
      return Object.freeze({ status: "resolved" as const, asset });
    },
  });
  return Object.freeze({
    document: result.document,
    reconciliation: result.reconciliation,
    renames: result.renames,
    metadata: result.metadata,
  });
}
