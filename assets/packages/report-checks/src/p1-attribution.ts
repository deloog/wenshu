/**
 * P1 块归属与行聚合：把文档期望块确定性地映射到证据 run 区间。
 *
 * 匹配采用反向游标（lastIndexOf 自后向前）：封面与正文一级标题同文、
 * 目录类前置同文（未来 PA-11 引入 TOC 后条目先于真实标题）等重复文本
 * 场景下，真实排版位置是文本流中较晚的出现，反向扫描优先命中它；
 * 这与 P0 的存在性检查目的不同（P0 只问“在不在”，P1 要问“在哪页”）。
 * 未命中的块跳过——内容缺失是 P0 域（p0-content），P1 不重复判定。
 *
 * 行聚合：同页 run 按 baselineY 聚类（容差 2pt，与 p0-overlap 同行判定
 * 口径一致），跨页段落身份来自文档侧归属，不靠几何猜测。
 */
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";

import type { ExpectedBlock } from "./expected-content.ts";

/** 同视觉行 baseline 容差（pt）：与 p0-overlap 的 same-visual-line 口径一致。 */
export const LINE_BASELINE_TOLERANCE_PT = 2;

export interface AttributedBlock {
  readonly block: ExpectedBlock;
  /** 覆盖该块归一文本区间的 run（orderedRuns 下标，升序、连续）。 */
  readonly runIndexes: readonly number[];
}

export interface BlockAttribution {
  /** 按 readingOrder 升序的证据 run（归属坐标系）。 */
  readonly orderedRuns: readonly TextRun[];
  /** 成功归属的块（expected 文档序）。 */
  readonly matched: readonly AttributedBlock[];
  /** 未归属块 ref（缺失内容归 P0 域，P1 仅跳过并暴露名单）。 */
  readonly unmatchedRefs: readonly string[];
}

/** 反向游标匹配：重复文本取文本流中较晚出现（真实排版位置）。 */
export function attributeBlocks(
  evidence: WenshuPdfEvidence,
  expected: readonly ExpectedBlock[],
): BlockAttribution {
  const orderedRuns = [...evidence.textRuns].sort(
    (a, b) => a.readingOrder - b.readingOrder,
  );
  const normalized = orderedRuns.map((run) => normalizePdfText(run.text));
  const joined = normalized.join("");
  const offsets: number[] = [];
  {
    let cursor = 0;
    for (const text of normalized) {
      offsets.push(cursor);
      cursor += text.length;
    }
  }

  const spans = new Map<ExpectedBlock, { start: number; end: number }>();
  const unmatchedRefs: string[] = [];
  let cursor = joined.length;
  for (let index = expected.length - 1; index >= 0; index -= 1) {
    const block = expected[index];
    if (block === undefined || block.repeatable) {
      continue;
    }
    // lastIndexOf 的位置参数包含该位置自身：游标须严格指向前次命中之前，
    // 否则同文相邻块（封面/正文同标题）会重复命中同一处。
    const at = cursor <= 0 ? -1 : joined.lastIndexOf(block.text, cursor - 1);
    if (at === -1) {
      unmatchedRefs.push(block.ref);
      continue;
    }
    spans.set(block, { start: at, end: at + block.text.length });
    cursor = at;
  }

  const matched: AttributedBlock[] = [];
  for (const block of expected) {
    const span = spans.get(block);
    if (span === undefined) {
      continue;
    }
    const runIndexes: number[] = [];
    for (let runIndex = 0; runIndex < orderedRuns.length; runIndex += 1) {
      const start = offsets[runIndex] ?? 0;
      const length = normalized[runIndex]?.length ?? 0;
      if (start < span.end && start + length > span.start) {
        runIndexes.push(runIndex);
      }
    }
    matched.push(Object.freeze({ block, runIndexes: Object.freeze(runIndexes) }));
  }
  unmatchedRefs.reverse();
  return Object.freeze({
    orderedRuns: Object.freeze(orderedRuns),
    matched: Object.freeze(matched),
    unmatchedRefs: Object.freeze(unmatchedRefs),
  });
}

/** 正文行聚合：排除 figure 成员 run（解析期成员事实，非几何推断）。 */
export function bodyRunIndexesOnPage(
  attribution: BlockAttribution,
  entry: AttributedBlock,
  pageIndex: number,
): number[] {
  return entry.runIndexes.filter((runIndex) => {
    const run = attribution.orderedRuns[runIndex];
    return run !== undefined && run.pageIndex === pageIndex && run.figureMcid === null;
  });
}

/** 同页 run 集合的视觉行数（baselineY 2pt 聚类）。 */
export function countLines(
  attribution: BlockAttribution,
  runIndexes: readonly number[],
): number {
  const baselines = runIndexes
    .map((runIndex) => attribution.orderedRuns[runIndex]?.baselineY)
    .filter((baseline): baseline is number => baseline !== undefined)
    .sort((a, b) => b - a);
  let lines = 0;
  let previous = Number.NaN;
  for (const baseline of baselines) {
    if (
      Number.isNaN(previous) ||
      Math.abs(baseline - previous) > LINE_BASELINE_TOLERANCE_PT
    ) {
      lines += 1;
      previous = baseline;
    }
  }
  return lines;
}

/** 块占据的页集合（升序；仅正文 run 计入）。 */
export function pagesOfBlock(
  attribution: BlockAttribution,
  entry: AttributedBlock,
): number[] {
  const pages = new Set<number>();
  for (const runIndex of entry.runIndexes) {
    const run = attribution.orderedRuns[runIndex];
    if (run !== undefined && run.figureMcid === null) {
      pages.add(run.pageIndex);
    }
  }
  return [...pages].sort((a, b) => a - b);
}
