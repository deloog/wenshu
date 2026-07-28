/**
 * 目录域分析（PA-11B，ADR-0011）：从证据 run + 期望块重建目录结构——
 * 条目↔正文标题 tocIndex 同源配对（文档序，禁文本猜测）、条目页码标注
 * 定位（标题 run 之后、下一条目标记之前的纯数字 run）、多余项候选
 * （目录区域内未被任何期望块覆盖的非数字 run）。
 * 识别依据均为文档侧装配事实与反向游标归属，零几何启发式；任何歧义
 * fail-closed 暴露给规则降人工，不在本模块猜测。
 */
import type { TextRun } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";

import type { ExpectedBlock } from "./expected-content.ts";
import { LINE_BASELINE_TOLERANCE_PT, attributeBlocks } from "./p1-attribution.ts";
import type { P1CheckInput } from "./p1-input.ts";

export interface TocEntryAnalysis {
  readonly tocIndex: number;
  /** toc-entry 期望块 ref（目录侧定位）。 */
  readonly entryRef: string;
  /** 配对 section-title 期望块 ref（正文侧定位）；未配对为 null。 */
  readonly headingRef: string | null;
  /** toc-entry 块是否归属（未归属 = 目录缺项候选）。 */
  readonly entryMatched: boolean;
  /** section-title 块是否归属（未归属 = 实际页不可判定）。 */
  readonly headingMatched: boolean;
  /** 正文标题实际印刷页（pageIndex）；不可判定为 null。 */
  readonly headingPage: number | null;
  /** 目录标注页码；无标注或歧义为 null。 */
  readonly label: number | null;
  /** 标注歧义（零/多个数字 run 或夹非数字文本）→ 降人工。 */
  readonly labelAmbiguous: boolean;
}

export interface TocAnalysis {
  /** 文档是否声明目录（期望块含 toc-heading）；无目录文档全域静默。 */
  readonly tocDomainPresent: boolean;
  /** toc-heading 是否归属（目录域可定位的前提）。 */
  readonly tocHeadingMatched: boolean;
  /** 目录页（toc-heading 所在 pageIndex，单页）；不可定位为 null。 */
  readonly tocPage: number | null;
  /** 期望目录条目数（collectTocEntries 文档序）。 */
  readonly entriesExpected: number;
  readonly entries: readonly TocEntryAnalysis[];
  /** 多余项候选：目录区域内未覆盖、归一非空且非纯数字的 run（按 readingOrder）。 */
  readonly extraRuns: readonly TextRun[];
}

const DIGITS_ONLY = /^[0-9]+$/u;

/** 目录区域：[toc-heading 首 run ro, 首个非 toc 块首 run ro)；正文在目录页之后。 */
function regionEnd(
  attribution: ReturnType<typeof attributeBlocks>,
  startRo: number,
): number {
  let end = Number.POSITIVE_INFINITY;
  for (const entry of attribution.matched) {
    if (
      entry.block.kind === "toc-heading" ||
      entry.block.kind === "toc-marker" ||
      entry.block.kind === "toc-entry"
    ) {
      continue;
    }
    const first = attribution.orderedRuns[entry.runIndexes[0] ?? -1];
    if (first !== undefined && first.readingOrder > startRo) {
      end = Math.min(end, first.readingOrder);
    }
  }
  return end;
}

export function analyzeToc(input: P1CheckInput): TocAnalysis {
  const tocDomainPresent = input.expected.some((block) => block.kind === "toc-heading");
  const entriesExpectedCount = input.expected.filter(
    (block) => block.kind === "toc-entry",
  ).length;
  if (!tocDomainPresent) {
    return Object.freeze({
      tocDomainPresent: false,
      tocHeadingMatched: false,
      tocPage: null,
      entriesExpected: 0,
      entries: Object.freeze([]),
      extraRuns: Object.freeze([]),
    });
  }
  const attribution = attributeBlocks(input.evidence, input.expected);
  const matchedByRef = new Map(
    attribution.matched.map((entry) => [entry.block.ref, entry]),
  );
  const tocHeading = attribution.matched.find(
    (entry) => entry.block.kind === "toc-heading",
  );
  if (tocHeading === undefined || tocHeading.runIndexes.length === 0) {
    return Object.freeze({
      tocDomainPresent: true,
      tocHeadingMatched: false,
      tocPage: null,
      entriesExpected: entriesExpectedCount,
      entries: Object.freeze([]),
      extraRuns: Object.freeze([]),
    });
  }
  const headingRuns = tocHeading.runIndexes.map(
    (runIndex) => attribution.orderedRuns[runIndex] as TextRun,
  );
  const headingPages = new Set(headingRuns.map((run) => run.pageIndex));
  const tocPage = headingPages.size === 1 ? (headingRuns[0]?.pageIndex ?? null) : null;
  const regionStart = Math.min(...headingRuns.map((run) => run.readingOrder));
  const regionLimit = regionEnd(attribution, regionStart);

  // 配对：tocIndex 同源序号（toc-entry ↔ section-title，ADR-0011 §2）。
  const sectionByTocIndex = new Map<number, ExpectedBlock>();
  for (const block of input.expected) {
    if (block.kind === "section-title" && block.tocIndex !== undefined) {
      sectionByTocIndex.set(block.tocIndex, block);
    }
  }

  // 区域内 toc 块的覆盖区间（标注窗口的边界）与全局覆盖集合（多余项判定）。
  const coveredRos = new Set<number>();
  for (const entry of attribution.matched) {
    for (const runIndex of entry.runIndexes) {
      const run = attribution.orderedRuns[runIndex];
      if (run !== undefined) {
        coveredRos.add(run.readingOrder);
      }
    }
  }

  const regionRuns = attribution.orderedRuns.filter(
    (run) =>
      run.readingOrder >= regionStart &&
      run.readingOrder < regionLimit &&
      run.figureMcid === null,
  );

  const tocBlocksInOrder = attribution.matched.filter(
    (entry) =>
      entry.block.kind === "toc-marker" ||
      entry.block.kind === "toc-entry" ||
      entry.block.kind === "toc-heading",
  );
  const boundaryOf = (afterRo: number): number => {
    let boundary = regionLimit;
    for (const entry of tocBlocksInOrder) {
      const first = attribution.orderedRuns[entry.runIndexes[0] ?? -1];
      if (first !== undefined && first.readingOrder > afterRo) {
        boundary = Math.min(boundary, first.readingOrder);
      }
    }
    return boundary;
  };

  const entries: TocEntryAnalysis[] = [];
  for (const block of input.expected) {
    if (block.kind !== "toc-entry" || block.tocIndex === undefined) {
      continue;
    }
    const section = sectionByTocIndex.get(block.tocIndex);
    const entryMatch = matchedByRef.get(block.ref);
    const headingMatch =
      section === undefined ? undefined : matchedByRef.get(section.ref);

    let headingPage: number | null = null;
    if (headingMatch !== undefined) {
      const pages = new Set<number>();
      for (const runIndex of headingMatch.runIndexes) {
        const run = attribution.orderedRuns[runIndex];
        if (run !== undefined && run.figureMcid === null) {
          pages.add(run.pageIndex);
        }
      }
      headingPage = pages.size === 1 ? ([...pages][0] ?? null) : null;
    }

    // 标注窗口：条目末 run 之后、下一 toc 块首 run 之前的区域 run。
    let label: number | null = null;
    let labelAmbiguous = false;
    if (entryMatch !== undefined && entryMatch.runIndexes.length > 0) {
      const lastRo =
        attribution.orderedRuns[
          entryMatch.runIndexes[entryMatch.runIndexes.length - 1] ?? -1
        ]?.readingOrder ?? regionStart;
      const limit = boundaryOf(lastRo);
      const windowTexts = regionRuns
        .filter((run) => run.readingOrder > lastRo && run.readingOrder < limit)
        .map((run) => normalizePdfText(run.text))
        .filter((text) => text.length > 0);
      // 标注可为多个数字 run（两位页码逐字 run，探针实测）；窗口内必须
      // 全为数字——夹任何非数字文本即歧义（fail-closed）。
      if (
        windowTexts.length > 0 &&
        windowTexts.every((text) => DIGITS_ONLY.test(text))
      ) {
        label = Number.parseInt(windowTexts.join(""), 10);
      } else {
        labelAmbiguous = true;
      }
    }

    entries.push(
      Object.freeze({
        tocIndex: block.tocIndex,
        entryRef: block.ref,
        headingRef: section?.ref ?? null,
        entryMatched: entryMatch !== undefined,
        headingMatched: headingMatch !== undefined,
        headingPage,
        label,
        labelAmbiguous,
      }),
    );
  }

  // 多余项候选：区域内未被期望块覆盖的归一非空非纯数字 run。
  const extraRuns = regionRuns.filter((run) => {
    if (coveredRos.has(run.readingOrder)) {
      return false;
    }
    const text = normalizePdfText(run.text);
    return text.length > 0 && !DIGITS_ONLY.test(text);
  });

  return Object.freeze({
    tocDomainPresent: true,
    tocHeadingMatched: true,
    tocPage,
    entriesExpected: entries.length,
    entries: Object.freeze(entries),
    extraRuns: Object.freeze(extraRuns),
  });
}

/** 多余项候选按视觉行分组（同页 baselineY 2pt 聚类），每组一条发现。 */
export function groupExtraRunsByLine(
  extraRuns: readonly TextRun[],
): readonly (readonly TextRun[])[] {
  const lines: TextRun[][] = [];
  const baselines: number[] = [];
  const sorted = [...extraRuns].sort(
    (a, b) =>
      a.pageIndex - b.pageIndex ||
      b.baselineY - a.baselineY ||
      a.readingOrder - b.readingOrder,
  );
  for (const run of sorted) {
    const lineIndex = baselines.findIndex(
      (baseline, index) =>
        lines[index]?.[0]?.pageIndex === run.pageIndex &&
        Math.abs(baseline - run.baselineY) <= LINE_BASELINE_TOLERANCE_PT,
    );
    if (lineIndex === -1) {
      lines.push([run]);
      baselines.push(run.baselineY);
    } else {
      lines[lineIndex]?.push(run);
    }
  }
  return Object.freeze(lines.map((line) => Object.freeze(line)));
}
