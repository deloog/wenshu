/**
 * P1 表格结构模块（PA-09 命门）：表结构 → 证据 run 的归属与验证。
 * 证据是纯几何 run（无表结构），表结构来自文档期望块
 * （<root>/columns/<c>/header、<root>/rows/<r>/cells/<c>），列/行规则
 * 来自冻结模板。归属三重防线：
 *   1. run 边界对齐——单元格文本必须是整 run 序列的拼接，拒绝嵌入
 *      更长文本内部的子串误配（基线 run 多为单字，短单元格如「风险」
 *      会撞上章节标题「六、风险、边界与降级」的内部子串）；
 *   2. 反向文档序游标——同文重复时取阅读序上紧邻表格数据的出现
 *      （表头 thead 在 DOM/阅读序中先于 tbody）；
 *   3. 几何一致性校验——同单元格同页单块序（MCID 块=DOM 元素）、
 *      列带（该列全部格 x 并集）相邻不重叠；任一不过即歧义。
 *      （行内列 x 序不单独校验：列带相邻不重叠 ⟹ 任意行内列 x 序
 *      必然成立，单列校验被列带校验逻辑蕴含，见实施记录。）
 * 歧义 fail-closed：两条判定规则各报告 P1_TABLE_STRUCTURE_REVIEW
 * 人工核验项并跳过该表的自动判定（不猜、不藏）。
 */
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";

import type { ExpectedBlock } from "./expected-content.ts";

/** 相邻单元格/列带 x 向容许缝隙（pt）：吸收字距与边框取整抖动。 */
export const COLUMN_GAP_TOLERANCE_PT = 1;

export interface TableHeaderInfo {
  readonly col: number;
  readonly ref: string;
  readonly text: string;
  readonly runIndexes: readonly number[];
}

export interface TableCellInfo {
  readonly row: number;
  readonly col: number;
  readonly ref: string;
  readonly runIndexes: readonly number[];
}

export interface TableStructure {
  readonly root: string;
  readonly headers: readonly TableHeaderInfo[];
  readonly cells: readonly TableCellInfo[];
  /** 歧义违规计数（>0 = 归属不可信，fail-closed）。 */
  readonly violations: number;
}

export interface TableAnalysis {
  /** 按 readingOrder 升序的证据 run（归属坐标系）。 */
  readonly orderedRuns: readonly TextRun[];
  readonly tables: readonly TableStructure[];
}

interface TableBlocks {
  readonly root: string;
  readonly headers: { col: number; block: ExpectedBlock }[];
  readonly cells: { row: number; col: number; block: ExpectedBlock }[];
}

/** 从期望块收集表格（ref 形态 <root>/columns/<c>/header 与 <root>/rows/<r>/cells/<c>）。 */
export function collectTableBlocks(expected: readonly ExpectedBlock[]): TableBlocks[] {
  const byRoot = new Map<
    string,
    {
      headers: { col: number; block: ExpectedBlock }[];
      cells: { row: number; col: number; block: ExpectedBlock }[];
    }
  >();
  for (const block of expected) {
    const header = /^(.+)\/columns\/(\d+)\/header$/.exec(block.ref);
    if (header !== null) {
      const entry = byRoot.get(header[1] ?? "") ?? { headers: [], cells: [] };
      entry.headers.push({ col: Number(header[2]), block });
      byRoot.set(header[1] ?? "", entry);
      continue;
    }
    const cell = /^(.+)\/rows\/(\d+)\/cells\/(\d+)$/.exec(block.ref);
    if (cell !== null) {
      const entry = byRoot.get(cell[1] ?? "") ?? { headers: [], cells: [] };
      entry.cells.push({ row: Number(cell[2]), col: Number(cell[3]), block });
      byRoot.set(cell[1] ?? "", entry);
    }
  }
  return [...byRoot.entries()].map(([root, value]) =>
    Object.freeze({
      root,
      headers: value.headers.sort((a, b) => a.col - b.col),
      cells: value.cells.sort((a, b) => a.row - b.row || a.col - b.col),
    }),
  );
}

interface RunIndex {
  readonly orderedRuns: readonly TextRun[];
  readonly joined: string;
  readonly offsets: readonly number[];
  readonly boundaries: ReadonlySet<number>;
}

function buildRunIndex(evidence: WenshuPdfEvidence): RunIndex {
  const orderedRuns = [...evidence.textRuns]
    .filter((run) => run.figureMcid === null)
    .sort((a, b) => a.readingOrder - b.readingOrder);
  const normalized = orderedRuns.map((run) => normalizePdfText(run.text));
  const offsets: number[] = [];
  const boundaries = new Set<number>();
  let cursor = 0;
  normalized.forEach((text) => {
    offsets.push(cursor);
    boundaries.add(cursor);
    cursor += text.length;
  });
  boundaries.add(cursor);
  return Object.freeze({
    orderedRuns: Object.freeze(orderedRuns),
    joined: normalized.join(""),
    offsets: Object.freeze(offsets),
    boundaries,
  });
}

/** 文本的所有 run 边界对齐出现位置（升序）。 */
function alignedOccurrences(index: RunIndex, text: string): number[] {
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const at = index.joined.indexOf(text, from);
    if (at === -1) {
      return out;
    }
    if (index.boundaries.has(at) && index.boundaries.has(at + text.length)) {
      out.push(at);
    }
    from = at + 1;
  }
}

function coveringRuns(index: RunIndex, start: number, end: number): number[] {
  const out: number[] = [];
  for (let runIndex = 0; runIndex < index.orderedRuns.length; runIndex += 1) {
    const runStart = index.offsets[runIndex] ?? 0;
    const runLength = (index.offsets[runIndex + 1] ?? index.joined.length) - runStart;
    if (runStart < end && runStart + runLength > start) {
      out.push(runIndex);
    }
  }
  return out;
}

/** 反向文档序归属：逐块取游标前最晚的边界对齐出现；缺席即歧义。 */
function attributeTableBlocks(
  index: RunIndex,
  blocks: readonly { ref: string; text: string }[],
): { spans: Map<string, number[]>; violations: number } {
  const spans = new Map<string, number[]>();
  let violations = 0;
  let cursor = index.joined.length;
  for (let blockIndex = blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
    const block = blocks[blockIndex];
    if (block === undefined) {
      continue;
    }
    const candidates = alignedOccurrences(index, block.text).filter(
      (at) => at < cursor,
    );
    const at = candidates[candidates.length - 1];
    if (at === undefined) {
      violations += 1;
      continue;
    }
    spans.set(block.ref, coveringRuns(index, at, at + block.text.length));
    cursor = at;
  }
  return { spans, violations };
}

export function xRange(
  runs: readonly TextRun[],
): { min: number; max: number } | undefined {
  if (runs.length === 0) {
    return undefined;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    min = Math.min(min, run.bbox.x);
    max = Math.max(max, run.bbox.x + run.bbox.width);
  }
  return { min, max };
}

/** 几何一致性校验：同格同页单块序、列带不重叠。 */
function validateGeometry(
  index: RunIndex,
  table: { headers: readonly TableHeaderInfo[]; cells: readonly TableCellInfo[] },
): number {
  let violations = 0;
  const all = [...table.headers, ...table.cells];
  // V2：同单元格同页 run 必须同属一个 MCID 块序（跨块=归属疑嵌入）。
  for (const cell of all) {
    const byPage = new Map<number, Set<number>>();
    for (const runIndex of cell.runIndexes) {
      const run = index.orderedRuns[runIndex];
      if (run === undefined) {
        continue;
      }
      const orders = byPage.get(run.pageIndex) ?? new Set<number>();
      orders.add(run.blockOrder);
      byPage.set(run.pageIndex, orders);
    }
    for (const orders of byPage.values()) {
      if (orders.size > 1) {
        violations += 1;
      }
    }
  }
  // V3：列带（该列全部单元格 x 并集）相邻不重叠。
  const bandByCol = new Map<number, { min: number; max: number }>();
  for (const cell of all) {
    const runs = cell.runIndexes
      .map((runIndex) => index.orderedRuns[runIndex])
      .filter((run): run is TextRun => run !== undefined);
    const range = xRange(runs);
    if (range === undefined) {
      continue;
    }
    const band = bandByCol.get(cell.col) ?? { min: range.min, max: range.max };
    band.min = Math.min(band.min, range.min);
    band.max = Math.max(band.max, range.max);
    bandByCol.set(cell.col, band);
  }
  const bands = [...bandByCol.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < bands.length; i += 1) {
    const previous = bands[i - 1]?.[1];
    const current = bands[i]?.[1];
    if (
      previous !== undefined &&
      current !== undefined &&
      current.min < previous.max - COLUMN_GAP_TOLERANCE_PT
    ) {
      violations += 1;
    }
  }
  return violations;
}

/** 表格结构归属总入口：无表格文档 → 空列表（零误报面）。 */
export function analyzeTables(
  evidence: WenshuPdfEvidence,
  expected: readonly ExpectedBlock[],
): TableAnalysis {
  const index = buildRunIndex(evidence);
  const tables: TableStructure[] = [];
  for (const tableBlocks of collectTableBlocks(expected)) {
    const docOrder = [
      ...tableBlocks.headers.map((header) => header.block),
      ...tableBlocks.cells.map((cell) => cell.block),
    ].sort((a, b) => expected.indexOf(a) - expected.indexOf(b));
    const attribution = attributeTableBlocks(index, docOrder);
    const headers: TableHeaderInfo[] = [];
    for (const header of tableBlocks.headers) {
      const runIndexes = attribution.spans.get(header.block.ref);
      if (runIndexes !== undefined) {
        headers.push(
          Object.freeze({
            col: header.col,
            ref: header.block.ref,
            text: header.block.text,
            runIndexes: Object.freeze(runIndexes),
          }),
        );
      }
    }
    const cells: TableCellInfo[] = [];
    for (const cell of tableBlocks.cells) {
      const runIndexes = attribution.spans.get(cell.block.ref);
      if (runIndexes !== undefined) {
        cells.push(
          Object.freeze({
            row: cell.row,
            col: cell.col,
            ref: cell.block.ref,
            runIndexes: Object.freeze(runIndexes),
          }),
        );
      }
    }
    const structure: TableStructure = {
      root: tableBlocks.root,
      headers: Object.freeze(headers),
      cells: Object.freeze(cells),
      violations: 0,
    };
    const violations = attribution.violations + validateGeometry(index, structure);
    tables.push(
      Object.freeze({
        root: tableBlocks.root,
        headers: structure.headers,
        cells: structure.cells,
        violations,
      }),
    );
  }
  return Object.freeze({
    orderedRuns: index.orderedRuns,
    tables: Object.freeze(tables),
  });
}
