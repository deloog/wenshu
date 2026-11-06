import { mkdtemp, rename, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

import {
  atomicWriteFile,
  classifyFsError,
  FileBoundaryError,
  IMPORT_TEMP_MARKER,
  isSafeFileName,
  protectImportedFile,
  readGrantedFile,
  type GrantTable,
} from "@wenshu/project-storage";

import { sha256Hex } from "./asset-resolution.ts";
import {
  importMarkdownDocumentFromText,
  type FailedAsset,
} from "./import-from-text.ts";
import { MarkdownImportError } from "./errors.ts";

export interface ImportProjectProgress {
  readonly phase: "read" | "parse" | "write" | "finalize";
  readonly completed: number;
  readonly total: number;
}

export interface ImportedAssetEntry {
  readonly fileName: string;
  /** 内容寻址路径 assets/<sha256前16>.<ext>（决策 #7）。 */
  readonly path: string;
}

export interface FailedAssetEntry {
  readonly fileName: string;
  readonly reasonCode: FailedAsset["reasonCode"];
  readonly retryable: true;
}

export type ImportProjectResult =
  | {
      readonly status: "success" | "partial";
      readonly targetDirName: string;
      readonly documentSha256: string;
      readonly materialName: string;
      readonly importedAssets: readonly ImportedAssetEntry[];
      readonly failedAssets: readonly FailedAssetEntry[];
    }
  | { readonly status: "cancelled" };

export interface ImportMarkdownProjectOptions {
  readonly grants: GrantTable;
  /** 父目录 grant，须 read_write。 */
  readonly projectGrantId: string;
  /** 平目录名（SAFE_FILE_NAME 同款白名单）。 */
  readonly targetDirName: string;
  /** 主 .md 的单文件 FileGrant（ADR-0029 R-3）。 */
  readonly sourceGrantId: string;
  readonly assetGrantIds?: readonly string[];
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ImportProjectProgress) => void;
}

/** 取消哨兵：内部抛出、顶层捕获后如实返回 cancelled 终态（不伪装 failure）。 */
class ImportCancelled extends Error {}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new ImportCancelled();
  }
}

/**
 * 写路径承重守卫（ADR-0029 §4）：任何落盘字节必须位于本次导入的临时
 * 暂存目录内——写操作结构性不可能触碰源原件或暂存目录外的任何位置。
 * 该守卫是真实承重的：放宽它必须让对应测试变红。
 */
export function assertWithinTemp(tempRoot: string, target: string): void {
  const rel = relative(resolve(tempRoot), resolve(target));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new FileBoundaryError("INTERNAL");
  }
}

/**
 * 项目导入执行器（ADR-0029 §2/§3/§4，事务骨架照 PB-11）：
 * 目标存在即拒（D2，不合并、不静默换名）→ 兄弟临时目录 → 读取/解析/写入
 * → protectImportedFile 登记（D3）→ rename 原子转正 → 失败/取消 rm 临时目录。
 * 任何写操作不触碰源文件；资源匹配只覆盖用户已选文件（R-3 单文件作用域），
 * 绝不扩大授权去读同目录未选文件。
 */
export async function importMarkdownProject(
  options: ImportMarkdownProjectOptions,
): Promise<ImportProjectResult> {
  const { grants, projectGrantId, targetDirName, sourceGrantId } = options;
  const assetGrantIds = options.assetGrantIds ?? [];
  const signal = options.signal;
  const onProgress = options.onProgress;

  // 1. 取消预检：不建任何文件。
  if (signal?.aborted === true) {
    return Object.freeze({ status: "cancelled" });
  }
  // 2. grant 边界 fail-closed。
  const grant = grants.resolve(projectGrantId);
  if (grant === undefined) {
    throw new FileBoundaryError("NOT_FOUND");
  }
  if (grant.mode !== "read_write") {
    throw new FileBoundaryError("PERMISSION_DENIED");
  }
  // 3. 平目录名白名单（复用 project-storage 唯一实现，防 PB-10 MI-06 双份漂移）。
  if (!isSafeFileName(targetDirName)) {
    throw new FileBoundaryError("INVALID");
  }
  const targetRoot = join(grant.root, targetDirName);
  // 4. D2：目标必须事先不存在。
  if ((await stat(targetRoot).catch(() => undefined)) !== undefined) {
    throw new FileBoundaryError("CONFLICT");
  }

  let tempRoot: string | undefined;
  try {
    // 5. 兄弟临时暂存目录（IMPORT_TEMP_MARKER 单源，孤儿由 recoverGrantDirectory 回收）。
    tempRoot = await mkdtemp(`${targetRoot}${IMPORT_TEMP_MARKER}`);
    throwIfCancelled(signal);

    // 选择时刻快照文件名（basename 匹配只覆盖已选文件）；handle 缺失 fail-closed。
    const sourceGrant = grants.resolveFile(sourceGrantId);
    if (sourceGrant === undefined) {
      throw new FileBoundaryError("NOT_FOUND");
    }
    const selectedAssets = assetGrantIds.map((grantId) => {
      const fileGrant = grants.resolveFile(grantId);
      if (fileGrant === undefined) {
        throw new FileBoundaryError("NOT_FOUND");
      }
      return Object.freeze({ grantId, name: basename(fileGrant.filePath) });
    });

    // 6. read：consume-on-read 读取源与全部已选资源（R-2）；读取失败直接上抛。
    const readTotal = 1 + selectedAssets.length;
    let readCompleted = 0;
    const sourceBytes = await readGrantedFile(grants, sourceGrantId);
    readCompleted += 1;
    onProgress?.(
      Object.freeze({ phase: "read", completed: readCompleted, total: readTotal }),
    );
    const bytesByGrant = new Map<string, Uint8Array>();
    for (const asset of selectedAssets) {
      throwIfCancelled(signal);
      bytesByGrant.set(asset.grantId, await readGrantedFile(grants, asset.grantId));
      readCompleted += 1;
      onProgress?.(
        Object.freeze({ phase: "read", completed: readCompleted, total: readTotal }),
      );
    }
    throwIfCancelled(signal);

    // 7. parse：R-3 匹配规则——引用 basename 在已选资源集中找；
    // 0 个 → asset_not_provided；≥2 个同 basename → asset_ambiguous；1 个 → 该文件字节。
    const ambiguousReferences = new Set<string>();
    const bytesByReference = new Map<string, Uint8Array>();
    const result = await importMarkdownDocumentFromText(
      new TextDecoder().decode(sourceBytes),
      basename(sourceGrant.filePath),
      (reference) => {
        const name = posix.basename(reference);
        const matches = selectedAssets.filter((asset) => asset.name === name);
        const match = matches.length === 1 ? matches[0] : undefined;
        if (match === undefined) {
          if (matches.length > 1) {
            ambiguousReferences.add(reference);
          }
          return Promise.resolve(undefined);
        }
        const bytes = bytesByGrant.get(match.grantId);
        if (bytes === undefined) {
          return Promise.resolve(undefined);
        }
        bytesByReference.set(reference, bytes);
        return Promise.resolve(bytes);
      },
    );
    onProgress?.(Object.freeze({ phase: "parse", completed: 1, total: 1 }));
    throwIfCancelled(signal);

    // asset_ambiguous 由执行器按匹配规则判定（from-text 入口只见 undefined）。
    const failedAssets: FailedAssetEntry[] = result.failedAssets.map((failed) =>
      Object.freeze({
        fileName: posix.basename(failed.reference),
        reasonCode: ambiguousReferences.has(failed.reference)
          ? ("asset_ambiguous" as const)
          : failed.reasonCode,
        retryable: true as const,
      }),
    );

    // 8. write：document.json + materials/<sha16>.md 原件副本 + 成功资源副本，
    // 逐文件 atomicWriteFile，写前一律过 assertWithinTemp 承重守卫。
    const documentBytes = new TextEncoder().encode(JSON.stringify(result.document));
    const materialName = `${sha256Hex(sourceBytes).slice(0, 16)}.md`;
    const writes: { readonly path: string; readonly bytes: Uint8Array }[] = [
      { path: join(tempRoot, "document.json"), bytes: documentBytes },
      { path: join(tempRoot, "materials", materialName), bytes: sourceBytes },
    ];
    const importedAssets: ImportedAssetEntry[] = [];
    const writtenAssetPaths = new Set<string>();
    for (const [reference, assetPath] of Object.entries(result.renames)) {
      if (writtenAssetPaths.has(assetPath)) {
        continue;
      }
      writtenAssetPaths.add(assetPath);
      const bytes = bytesByReference.get(reference);
      if (bytes === undefined) {
        throw new FileBoundaryError("INTERNAL");
      }
      importedAssets.push(
        Object.freeze({ fileName: posix.basename(assetPath), path: assetPath }),
      );
      writes.push({ path: join(tempRoot, ...assetPath.split("/")), bytes });
    }
    let writeCompleted = 0;
    for (const write of writes) {
      throwIfCancelled(signal);
      assertWithinTemp(tempRoot, write.path);
      await atomicWriteFile(write.path, write.bytes);
      writeCompleted += 1;
      onProgress?.(
        Object.freeze({
          phase: "write",
          completed: writeCompleted,
          total: writes.length,
        }),
      );
    }

    // 9. D3：原件副本与资源副本的平文件名在 project grant 上保护登记，
    // 登记名与真实落点名一致（内容寻址名即真实落点名）。
    protectImportedFile(grant, materialName);
    for (const asset of importedAssets) {
      protectImportedFile(grant, asset.fileName);
    }

    // 10. finalize：rename 原子转正；目标只在完整暂存后出现。
    throwIfCancelled(signal);
    await rename(tempRoot, targetRoot);
    tempRoot = undefined;
    onProgress?.(Object.freeze({ phase: "finalize", completed: 1, total: 1 }));

    return Object.freeze({
      status: failedAssets.length > 0 ? ("partial" as const) : ("success" as const),
      targetDirName,
      documentSha256: sha256Hex(documentBytes),
      materialName,
      importedAssets: Object.freeze(importedAssets),
      failedAssets: Object.freeze(failedAssets),
    });
  } catch (error) {
    // 11. 任何失败/取消：rm 临时目录，目标根永不以半成品形态出现。
    if (tempRoot !== undefined) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
    if (error instanceof ImportCancelled) {
      return Object.freeze({ status: "cancelled" });
    }
    if (error instanceof FileBoundaryError || error instanceof MarkdownImportError) {
      throw error;
    }
    throw classifyFsError(error);
  }
}
