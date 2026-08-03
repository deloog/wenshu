import { createHash } from "node:crypto";

import type { ResolvedAsset } from "./document.ts";
import { MarkdownImportError } from "./errors.ts";

const MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze({
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
});

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * 引用逃逸与类型白名单校验（决策 #7/#9 规则的逐字唯一归口）：
 * 反斜杠、绝对路径、盘符、`.`/`..` 片段一律拒绝；扩展名必须在 v0 白名单内。
 * 两个导入入口（路径入口与文本入口）共用本函数，规则不得出现第二份实现。
 */
export function validateAssetReference(reference: string): {
  readonly extension: string;
  readonly mediaType: string;
} {
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
  return Object.freeze({ extension, mediaType });
}

/**
 * 内容寻址资源构建（决策 #7）：资产 id 与落盘路径只由字节内容派生，
 * 原始文件名永不进入文档对象、永不落盘。
 */
export function buildContentAddressedAsset(
  reference: string,
  bytes: Uint8Array,
): ResolvedAsset {
  const { extension, mediaType } = validateAssetReference(reference);
  const digest = sha256Hex(bytes);
  return Object.freeze({
    id: `asset_${digest.slice(0, 32)}`,
    kind: "image",
    path: `assets/${digest.slice(0, 16)}.${extension}`,
    mediaType,
    sha256: digest,
  });
}
