/**
 * P1 表格页态辅助（PA-09）：表格占据页集合、列带几何锚、续页表头对账。
 * 从 p1-tables.ts 拆出（文件体量门）；结构归属与校验见 p1-tables.ts。
 */
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";

import { LINE_BASELINE_TOLERANCE_PT } from "./p1-attribution.ts";
import {
  COLUMN_GAP_TOLERANCE_PT,
  xRange,
  type TableAnalysis,
  type TableStructure,
} from "./p1-tables.ts";

/** 表格占据页集合（表头 + 数据单元格，升序）。 */
export function tablePages(analysis: TableAnalysis, table: TableStructure): number[] {
  const pages = new Set<number>();
  for (const item of [...table.headers, ...table.cells]) {
    for (const runIndex of item.runIndexes) {
      const run = analysis.orderedRuns[runIndex];
      if (run !== undefined) {
        pages.add(run.pageIndex);
      }
    }
  }
  return [...pages].sort((a, b) => a - b);
}

/** 列带（该列表头 + 数据单元格 x 并集）；表头续页对账的几何锚。 */
export function columnBands(
  analysis: TableAnalysis,
  table: TableStructure,
): ReadonlyMap<number, { min: number; max: number }> {
  const bands = new Map<number, { min: number; max: number }>();
  for (const item of [...table.headers, ...table.cells]) {
    const range = xRange(
      item.runIndexes
        .map((runIndex) => analysis.orderedRuns[runIndex])
        .filter((run): run is TextRun => run !== undefined),
    );
    if (range === undefined) {
      continue;
    }
    const band = bands.get(item.col) ?? { min: range.min, max: range.max };
    band.min = Math.min(band.min, range.min);
    band.max = Math.max(band.max, range.max);
    bands.set(item.col, band);
  }
  return bands;
}

/**
 * 续页表头对账：页 P 上列 c 的 x 带内、且整体位于首行数据之上，存在
 * 连续 run 序列其拼接归一文本 === 表头文本（对账文档表头 vs 各页 run）。
 * 已知口径边界：同文同列且居于续页首行的数据行与表头在文本+几何上
 * 同构，不可区分（实现期内核审计面，书面登记）。
 */
export function headerRepeatedOnPage(
  evidence: WenshuPdfEvidence,
  headerText: string,
  band: { min: number; max: number },
  pageIndex: number,
  firstDataBaseline: number,
): boolean {
  const pageRuns = evidence.textRuns
    .filter((run) => run.pageIndex === pageIndex && run.figureMcid === null)
    .sort((a, b) => a.readingOrder - b.readingOrder);
  const normalized = pageRuns.map((run) => normalizePdfText(run.text));
  const joined = normalized.join("");
  const offsets: number[] = [];
  {
    let cursor = 0;
    for (const text of normalized) {
      offsets.push(cursor);
      cursor += text.length;
    }
  }
  let from = 0;
  for (;;) {
    const at = joined.indexOf(headerText, from);
    if (at === -1) {
      return false;
    }
    const group: TextRun[] = [];
    for (let i = 0; i < pageRuns.length; i += 1) {
      const start = offsets[i] ?? 0;
      const length = normalized[i]?.length ?? 0;
      if (start < at + headerText.length && start + length > at) {
        const run = pageRuns[i];
        if (run !== undefined) {
          group.push(run);
        }
      }
    }
    const range = xRange(group);
    const minBaseline =
      group.length > 0 ? Math.min(...group.map((run) => run.baselineY)) : Number.NaN;
    if (
      group.length > 0 &&
      range !== undefined &&
      range.min >= band.min - COLUMN_GAP_TOLERANCE_PT &&
      range.max <= band.max + COLUMN_GAP_TOLERANCE_PT &&
      minBaseline > firstDataBaseline + LINE_BASELINE_TOLERANCE_PT
    ) {
      return true;
    }
    from = at + 1;
  }
}
