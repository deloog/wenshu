import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

import { validateDocument } from "@wenshu/document-model";

import { MarkdownImportError } from "./errors.ts";
import {
  assembleDocument,
  type ResolvedAsset,
  type ResolvedFigure,
} from "./document.ts";
import { parseMarkdown } from "./parser.ts";
import { buildReconciliation } from "./reconcile.ts";
import type { ImportResult } from "./types.ts";

const MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze({
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function resolveAsset(
  sourcePath: string,
  reference: string,
): Promise<{ asset: ResolvedAsset; bytes: Uint8Array }> {
  if (
    reference.includes("\\") ||
    reference.startsWith("/") ||
    /^[A-Za-z]:/u.test(reference) ||
    reference.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    throw new MarkdownImportError(
      "IMPORT_ASSET_INVALID",
      "asset reference escapes the import root",
    );
  }
  const extension = reference.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = MEDIA_TYPES[extension];
  if (mediaType === undefined) {
    throw new MarkdownImportError(
      "IMPORT_ASSET_INVALID",
      "asset type is outside the v0 whitelist; convert to png/jpeg/svg first",
    );
  }
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
  const digest = sha256(bytes);
  return {
    asset: Object.freeze({
      id: `asset_${digest.slice(0, 32)}`,
      kind: "image",
      path: `assets/${digest.slice(0, 16)}.${extension}`,
      mediaType,
      sha256: digest,
    }),
    bytes,
  };
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
  const parsed = parseMarkdown(source);
  const figures: ResolvedFigure[] = [];
  const assets = new Map<string, ResolvedAsset>();
  const renames: Record<string, string> = {};
  for (const block of parsed.blocks) {
    if (block.kind !== "figure") {
      continue;
    }
    const { asset } = await resolveAsset(sourcePath, block.source);
    assets.set(asset.id, asset);
    renames[block.source] = asset.path;
    figures.push(
      Object.freeze({ source: block.source, alt: block.alt, assetId: asset.id }),
    );
  }
  const document = assembleDocument(
    parsed,
    figures,
    [...assets.values()],
    documentNamespace,
  );
  const validation = validateDocument(document);
  if (!validation.ok) {
    // 只携带稳定 code 与 JSON 路径，不回显正文、标题或资源内容（document-model §5）。
    const detail = validation.issues
      .map((issue) => `${issue.code} at ${issue.path}`)
      .join("; ");
    throw new MarkdownImportError(
      "IMPORT_RECONCILE_FAILED",
      `assembled document does not satisfy the document contract: ${detail}`,
    );
  }
  const reconciliation = buildReconciliation(parsed, document);
  return Object.freeze({
    document,
    reconciliation,
    renames: Object.freeze(renames),
    metadata: parsed.metadata,
  });
}
