/**
 * A-04E-2b 工装（决策 #25 D1，非产品）：确定性编辑脚本与真实编辑事务链。
 *
 * - 段落选择算法照 test/incremental.render.test.ts 的 pickEditableParagraph，
 *   扩展为正文早/中/晚三个页区（30 页语料上选择过程本身确定性）。
 * - 每次编辑走真实事务链：TransactionManager begin → apply(rewrite) →
 *   commit → outcome.affectedNodeIds。editor-transactions 无独立「段落文本
 *   替换」命令；rewrite（整块同型替换、保全部身份）是最接近的真实命令，
 *   替换块 = 原段落块仅 text 同长替换（前缀含「2b工装」字样供对账识别）。
 * - affectedNodeIds 口径偏差（如实说明）：rewriteBlock 的 affected 集含
 *   父节 id（父通知语义），而父节标题（level<=2）同时出现在目录页与该节
 *   页，控制器锚定对多页命中 fail-closed 退 full-required。为测量增量
 *   路径，传给 controller.update 的是文本实际变更的叶块 id（rewrite 目标
 *   自身，与 incremental.render.test.ts 用法形态一致）；链上逐字结果由
 *   驱动记录于 edits[].chainAffectedNodeIds。
 */
import type { WenshuDocument } from "@wenshu/document-model";
import type { TransactionManager } from "@wenshu/editor-transactions";
import { fromProseMirrorDocument } from "@wenshu/semantic-editor";

import { locateAnchorPage } from "../src/incremental.ts";
import { normalizePdfText } from "../src/index.ts";

/** 同长替换前缀（12 个 UTF-16 码元，等宽 CJK 对 CJK 不改分页；含「2b工装」供对账识别）。 */
export const SUBSTITUTION = "2b工装替换验证甲乙丙丁";

export type HarnessBlock = WenshuDocument["blocks"][number];

/** 逐编辑报告记录（harness 主件 file-size 纯搬迁，A-04E-2c；字段口径见报告头）。 */
export interface EditRecord {
  readonly edit: number;
  readonly zone: string;
  readonly nodeId: string;
  readonly anchorPage0: number;
  readonly chainAffectedNodeIds: readonly string[];
  readonly updateAffectedNodeIds: readonly string[];
  readonly kind: string;
  /** 编辑提交→层 1 HTML 预览 load（ms）；窗口内 printToPdf 数（===0 断言）。 */
  readonly layer1UpdateMs: number;
  readonly layer1PrintCalls: number;
  /** 编辑提交→页槽 embed 注入完成（ms；仅增量编辑；判定器 G9）。 */
  readonly layer2UpdateMs?: number | undefined;
  readonly reason?: string;
  readonly pageRangesPrinted: readonly string[];
  readonly updatedRange?: readonly [number, number];
  readonly timings: unknown;
  readonly slotsUpdated: readonly number[];
  readonly tocSlotUpdated: boolean;
  readonly reconcile?: unknown;
}

export function flattenBlocks(blocks: readonly HarnessBlock[]): HarnessBlock[] {
  const out: HarnessBlock[] = [];
  for (const block of blocks) {
    out.push(block);
    if (block.type === "section") {
      out.push(...flattenBlocks(block.children));
    }
  }
  return out;
}

/** 选一个指定页区内、锚定唯一的段落（见模块头算法出处）。 */
export function pickEditableParagraph(
  document: WenshuDocument,
  pageTextIndex: readonly string[],
  pageCount: number,
  zoneIndex: number,
  usedIds: ReadonlySet<string>,
): { readonly id: string; readonly page: number } {
  const lo = 6;
  const hi = pageCount - 4;
  const zoneLo = lo + Math.floor(((hi - lo) * zoneIndex) / 3);
  const zoneHi = lo + Math.floor(((hi - lo) * (zoneIndex + 1)) / 3);
  for (const block of flattenBlocks(document.blocks)) {
    if (block.type !== "paragraph" || block.text.length < 30) {
      continue;
    }
    if (usedIds.has(block.id)) {
      continue;
    }
    const anchor = normalizePdfText(block.text).slice(0, 32);
    const hits = pageTextIndex.filter((text) => text.includes(anchor)).length;
    if (hits !== 1) {
      continue;
    }
    const page = locateAnchorPage(pageTextIndex, anchor, "pick");
    if (page >= zoneLo && page <= zoneHi) {
      return Object.freeze({ id: block.id, page });
    }
  }
  throw new Error(`no uniquely-locatable paragraph in zone ${zoneIndex}`);
}

export interface ChainEdit {
  readonly document: WenshuDocument;
  readonly affectedNodeIds: readonly string[];
  readonly before: string;
  readonly after: string;
}

function commitRewrite(
  manager: TransactionManager,
  command: {
    readonly kind: "rewrite";
    readonly id: string;
    readonly replacement: HarnessBlock;
  },
): { readonly document: WenshuDocument; readonly affectedNodeIds: readonly string[] } {
  const session = manager.begin("human");
  session.apply(command);
  const outcome = manager.commit(session);
  if (outcome.status !== "committed") {
    throw new Error(`transaction did not commit: ${outcome.status}`);
  }
  return Object.freeze({
    document: fromProseMirrorDocument(outcome.document) as WenshuDocument,
    affectedNodeIds: outcome.affectedNodeIds,
  });
}

/** 段落同长替换（真实事务链）。 */
export function applyParagraphRewrite(
  manager: TransactionManager,
  document: WenshuDocument,
  id: string,
): ChainEdit {
  const target = flattenBlocks(document.blocks).find((block) => block.id === id);
  if (target?.type !== "paragraph") {
    throw new Error("rewrite target must be a paragraph");
  }
  const after = `${SUBSTITUTION}${target.text.slice(SUBSTITUTION.length)}`;
  if (after.length !== target.text.length || after === target.text) {
    throw new Error("substitution must be a same-length real change");
  }
  const committed = commitRewrite(manager, {
    kind: "rewrite",
    id,
    replacement: { ...target, text: after },
  });
  return Object.freeze({ ...committed, before: target.text, after });
}

/**
 * 标题编辑（真实事务链 rewrite 节块标题）：目录条目集变化 → full-required。
 * 取真实目录收录的首个节（排除封面节：封面改标题走的是 cover 排除翻转，
 * 不是「目录收录条目标题变更」这一代表性形态）。
 */
export function applyHeadingRewrite(
  manager: TransactionManager,
  document: WenshuDocument,
  firstTocEntryId: string,
): ChainEdit {
  const section = flattenBlocks(document.blocks).find(
    (block) => block.type === "section" && block.id === firstTocEntryId,
  );
  if (section?.type !== "section") {
    throw new Error("first TOC-listed section not found");
  }
  const after = `${section.title}（2b工装改）`;
  const committed = commitRewrite(manager, {
    kind: "rewrite",
    id: section.id,
    replacement: { ...section, title: after },
  });
  return Object.freeze({ ...committed, before: section.title, after });
}
