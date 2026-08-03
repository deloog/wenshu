import { validateDocument } from "@wenshu/document-model";

import {
  buildContentAddressedAsset,
  validateAssetReference,
} from "./asset-resolution.ts";
import {
  assembleDocument,
  type ResolvedAsset,
  type ResolvedFigure,
} from "./document.ts";
import type { IntermediateBlock } from "./blocks.ts";
import { MarkdownImportError } from "./errors.ts";
import { parseMarkdown, type ParsedSource } from "./parser.ts";
import { buildReconciliation, type ExcludedFigure } from "./reconcile.ts";
import type { ImportResult } from "./types.ts";

export type FailedAssetReasonCode =
  | "asset_not_provided"
  | "asset_unreadable"
  | "asset_type_unsupported"
  | "asset_ambiguous";

export interface FailedAsset {
  /** markdown 内的原始引用（只作呈现与对账，永不参与文件系统寻址）。 */
  readonly reference: string;
  readonly reasonCode: FailedAssetReasonCode;
}

export interface ImportFromTextResult extends ImportResult {
  /** 逐资源失败收集（ADR-0029 §4）：失败的 figure 不进文档，但逐项如实记录。 */
  readonly failedAssets: readonly FailedAsset[];
}

export type FigureResolution =
  | { readonly status: "resolved"; readonly asset: ResolvedAsset }
  | { readonly status: "failed"; readonly reasonCode: FailedAssetReasonCode };

export interface ImportCoreOptions {
  readonly source: string;
  readonly documentNamespace: string;
  /**
   * 解析单个 figure 引用。回调抛错即整单失败（路径入口的 all-or-nothing
   * 语义靠直接抛错保持逐字节不变）；返回 failed 则逐资源收集、导入继续。
   */
  readonly resolveFigureAsset: (reference: string) => Promise<FigureResolution>;
}

/**
 * 两个导入入口共用的解析核心（ADR-0029 §4 additive）：parse → 逐 figure
 * 解析 → assemble → 契约校验 → 对账。失败的 figure 从文档块序列中排除，
 * 其余账目（consumed 行、renames、metadata）保持真实。
 */
export async function importCore(
  options: ImportCoreOptions,
): Promise<ImportFromTextResult> {
  const parsed: ParsedSource = parseMarkdown(options.source);
  const figures: ResolvedFigure[] = [];
  const includedBlocks: IntermediateBlock[] = [];
  const assets = new Map<string, ResolvedAsset>();
  const renames: Record<string, string> = {};
  const failedAssets: FailedAsset[] = [];
  const excludedFigures: ExcludedFigure[] = [];
  for (const block of parsed.blocks) {
    if (block.kind !== "figure") {
      includedBlocks.push(block);
      continue;
    }
    const outcome = await options.resolveFigureAsset(block.source);
    if (outcome.status === "failed") {
      failedAssets.push(
        Object.freeze({ reference: block.source, reasonCode: outcome.reasonCode }),
      );
      excludedFigures.push({ alt: block.alt });
      continue;
    }
    includedBlocks.push(block);
    assets.set(outcome.asset.id, outcome.asset);
    renames[block.source] = outcome.asset.path;
    figures.push(
      Object.freeze({
        source: block.source,
        alt: block.alt,
        assetId: outcome.asset.id,
      }),
    );
  }
  const document = assembleDocument(
    { ...parsed, blocks: includedBlocks },
    figures,
    [...assets.values()],
    options.documentNamespace,
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
  const reconciliation = buildReconciliation(parsed, document, excludedFigures);
  return Object.freeze({
    document,
    reconciliation,
    renames: Object.freeze(renames),
    metadata: parsed.metadata,
    failedAssets: Object.freeze(failedAssets),
  });
}

/**
 * 文本 + 资源解析回调入口（ADR-0029 §4）：解析与现有路径入口同路径，
 * 但单个资源失败不再整单抛错——该 figure 降级为失败项（不进文档），
 * 导入继续。引用逃逸与类型白名单校验与路径入口逐字一致，此类失败归入
 * asset_type_unsupported；resolver 返回 undefined 记 asset_not_provided，
 * resolver 抛错记 asset_unreadable；asset_ambiguous 由调用方（执行器）
 * 按匹配规则判定后改写。全部 figure 失败而正文成功仍是正常返回（partial
 * 由调用方判定）；若排除后 blocks 为空则契约必拒，整单
 * IMPORT_RECONCILE_FAILED（真实的整体失败，不伪装 partial）。
 */
export async function importMarkdownDocumentFromText(
  source: string,
  documentNamespace: string,
  resolveAssetBytes: (reference: string) => Promise<Uint8Array | undefined>,
): Promise<ImportFromTextResult> {
  return importCore({
    source,
    documentNamespace,
    resolveFigureAsset: async (reference) => {
      try {
        validateAssetReference(reference);
      } catch {
        return Object.freeze({
          status: "failed",
          reasonCode: "asset_type_unsupported" as const,
        });
      }
      let bytes: Uint8Array | undefined;
      try {
        bytes = await resolveAssetBytes(reference);
      } catch {
        return Object.freeze({
          status: "failed",
          reasonCode: "asset_unreadable" as const,
        });
      }
      if (bytes === undefined) {
        return Object.freeze({
          status: "failed",
          reasonCode: "asset_not_provided" as const,
        });
      }
      return Object.freeze({
        status: "resolved" as const,
        asset: buildContentAddressedAsset(reference, bytes),
      });
    },
  });
}
