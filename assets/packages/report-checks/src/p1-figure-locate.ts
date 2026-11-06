/**
 * 图片题注/来源 run 定位（PA-10）：在非成员 run（figureMcid===null，解析期
 * 成员事实，禁几何推断成员资格）中按页拼接归一文本，整串匹配且两端落在
 * run 边界（防嵌入长 run 内部的子串误配，PA-09 同款防线）。命中 run 必须
 * 阅读序连续且同属单一 MCID 块（题注/来源各是一个 DOM 块），否则记歧义
 * 由调用方 fail-closed 降人工——不猜。
 */
import { normalizePdfText } from "@wenshu/pdf-export";
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";

export interface RunSpan {
  /** 命中 run 在 evidence.textRuns 中的下标（阅读序升序）。 */
  readonly runIndexes: readonly number[];
  readonly pageIndex: number;
  readonly firstReadingOrder: number;
  readonly lastReadingOrder: number;
  /** 命中 run 顶边 y 的最小值（y 轴向上：越小越靠页面下方）。 */
  readonly topY: number;
}

export interface LocateResult {
  /** 通过全部防线的候选（可能多个 → 调用方判歧义）。 */
  readonly spans: readonly RunSpan[];
  /** 文本对齐但块序/连续性校验未过的出现次数（歧义证据）。 */
  readonly ambiguousOccurrences: number;
}

interface PageIndex {
  readonly runIndexes: readonly number[];
  readonly joined: string;
  readonly boundaries: ReadonlySet<number>;
}

function buildPageIndex(evidence: WenshuPdfEvidence, pageIndex: number): PageIndex {
  const candidates: number[] = [];
  evidence.textRuns.forEach((run, runIndex) => {
    if (run.pageIndex !== pageIndex || run.figureMcid !== null) {
      return;
    }
    candidates.push(runIndex);
  });
  // 阅读序拼接（PA-05 口径），文本在数组中的物理顺序不作数。
  candidates.sort(
    (a, b) =>
      (evidence.textRuns[a]?.readingOrder ?? 0) -
      (evidence.textRuns[b]?.readingOrder ?? 0),
  );
  const runIndexes: number[] = [];
  let joined = "";
  const boundaries = new Set<number>([0]);
  for (const runIndex of candidates) {
    runIndexes.push(runIndex);
    joined += normalizePdfText(evidence.textRuns[runIndex]?.text ?? "");
    boundaries.add(joined.length);
  }
  return { runIndexes, joined, boundaries };
}

function spanFrom(
  evidence: WenshuPdfEvidence,
  page: PageIndex,
  pageIndex: number,
  start: number,
  end: number,
): RunSpan | null {
  const runs: { run: TextRun; runIndex: number }[] = [];
  let offset = 0;
  for (const runIndex of page.runIndexes) {
    const length = normalizePdfText(evidence.textRuns[runIndex]?.text ?? "").length;
    const runStart = offset;
    offset += length;
    if (runStart >= start && runStart < end) {
      // 归一后零长的 run（如纯空白）仍属命中段内部，必须计入否则
      // 连续性防线会把合法段落误判为歧义。
      const run = evidence.textRuns[runIndex];
      if (run !== undefined) {
        runs.push({ run, runIndex });
      }
    }
  }
  if (runs.length === 0) {
    return null;
  }
  // 防线二：阅读序连续（题注/来源内部不允许夹入其他 run）。
  for (let i = 1; i < runs.length; i += 1) {
    const prev = runs[i - 1]?.run;
    const curr = runs[i]?.run;
    if (prev === undefined || curr === undefined) {
      return null;
    }
    if (curr.readingOrder !== prev.readingOrder + 1) {
      return null;
    }
  }
  // 防线三：同属单一 MCID 块（一个 DOM 块）。
  const block = runs[0]?.run.blockOrder;
  if (runs.some(({ run }) => run.blockOrder !== block)) {
    return null;
  }
  const first = runs[0]?.run;
  const last = runs[runs.length - 1]?.run;
  if (first === undefined || last === undefined) {
    return null;
  }
  return Object.freeze({
    runIndexes: Object.freeze(runs.map(({ runIndex }) => runIndex)),
    pageIndex,
    firstReadingOrder: first.readingOrder,
    lastReadingOrder: last.readingOrder,
    topY: Math.min(...runs.map(({ run }) => run.bbox.y)),
  });
}

/** 在全部页面定位归一目标文本的对齐出现（run 边界对齐 + 连续 + 单块）。 */
export function locateText(
  evidence: WenshuPdfEvidence,
  normalizedTarget: string,
): LocateResult {
  if (normalizedTarget.length === 0) {
    return Object.freeze({ spans: Object.freeze([]), ambiguousOccurrences: 0 });
  }
  const spans: RunSpan[] = [];
  let ambiguousOccurrences = 0;
  for (const page of evidence.pages) {
    const pageIndex = buildPageIndex(evidence, page.index);
    let from = 0;
    for (;;) {
      const at = pageIndex.joined.indexOf(normalizedTarget, from);
      if (at === -1) {
        break;
      }
      from = at + 1;
      const end = at + normalizedTarget.length;
      if (!pageIndex.boundaries.has(at) || !pageIndex.boundaries.has(end)) {
        ambiguousOccurrences += 1;
        continue;
      }
      const span = spanFrom(evidence, pageIndex, page.index, at, end);
      if (span === null) {
        ambiguousOccurrences += 1;
        continue;
      }
      spans.push(span);
    }
  }
  return Object.freeze({
    spans: Object.freeze(spans),
    ambiguousOccurrences,
  });
}
