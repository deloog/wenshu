/**
 * P1 跨页段落分裂信息（p1-orphan / p1-widow 共享）：段落身份来自
 * 文档侧归属（非几何猜测），行数按 baseline 聚类。只考察正文块
 * （paragraph/quote/list-item）；quote 的 attribution 短行、表格单元格
 * 与图片题注分别归各自语义与 PA-09/10 专项域，不在此列。
 */
import {
  attributeBlocks,
  bodyRunIndexesOnPage,
  countLines,
  pagesOfBlock,
  type BlockAttribution,
} from "./p1-attribution.ts";
import type { ExpectedBlockKind } from "./expected-content.ts";
import type { P1CheckInput } from "./p1-input.ts";

const SPLIT_BLOCK_KINDS: readonly ExpectedBlockKind[] = [
  "paragraph",
  "quote",
  "list-item",
];

export interface ParagraphSplit {
  readonly blockRef: string;
  readonly firstPage: number;
  readonly lastPage: number;
  /** 首页（页尾侧）保留行数。 */
  readonly firstPageLines: number;
  /** 末页（页首侧）保留行数。 */
  readonly lastPageLines: number;
  readonly totalLines: number;
}

/** 跨页正文块的分裂形态；单页块不产生孤行/寡行问题，不返回。 */
export function findParagraphSplits(
  input: P1CheckInput,
  attribution?: BlockAttribution,
): { attribution: BlockAttribution; splits: ParagraphSplit[] } {
  const resolved = attribution ?? attributeBlocks(input.evidence, input.expected);
  const splits: ParagraphSplit[] = [];
  for (const entry of resolved.matched) {
    if (!SPLIT_BLOCK_KINDS.includes(entry.block.kind)) {
      continue;
    }
    const pages = pagesOfBlock(resolved, entry);
    const firstPage = pages[0];
    const lastPage = pages[pages.length - 1];
    if (firstPage === undefined || lastPage === undefined || firstPage === lastPage) {
      continue;
    }
    const firstPageLines = countLines(
      resolved,
      bodyRunIndexesOnPage(resolved, entry, firstPage),
    );
    const lastPageLines = countLines(
      resolved,
      bodyRunIndexesOnPage(resolved, entry, lastPage),
    );
    let totalLines = 0;
    for (const page of pages) {
      totalLines += countLines(resolved, bodyRunIndexesOnPage(resolved, entry, page));
    }
    splits.push(
      Object.freeze({
        blockRef: entry.block.ref,
        firstPage,
        lastPage,
        firstPageLines,
        lastPageLines,
        totalLines,
      }),
    );
  }
  return { attribution: resolved, splits };
}
