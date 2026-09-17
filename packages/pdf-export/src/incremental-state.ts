import { TOC_HEADING, type WenshuDocument } from "@wenshu/document-model";

import { extractGeometry, type GeometryTextRun, type PdfGeometry } from "./geometry.ts";
import { buildPageTextIndex, pageRuns, runKeyTagFree } from "./incremental.ts";
import { normalizePdfText } from "./reconcile.ts";

/**
 * A-04E-2b 增量预览状态（ADR-0033）：不可变快照 + 状态构建/合并纯函数。
 * IO 驱动在 incremental-controller.ts，本文件不碰浏览器与字节流产出。
 */

/** 预览状态（每次增量成功后整体替换，不可变快照）。 */
export interface PreviewState {
  readonly document: WenshuDocument;
  /** 压印前整份字节（初次导出的 contentBytes）；增量成功后置 null（窗页已变，整份字节不再是当前状态的真源）。 */
  readonly contentBytes: Uint8Array | null;
  /** 旧整份字节（未受影响页的显示源；内容级未压印态，页眉页脚由显示层覆盖）。 */
  readonly displayBytes: Uint8Array;
  /** displayBytes 对应内容态的逐页几何（窗页已合并最新证据）。 */
  readonly geometry: PdfGeometry;
  /** 逐页归一化拼接文本（锚定/哨兵索引，随窗页合并更新）。 */
  readonly pageTextIndex: readonly string[];
  /** 目录条目 → 实测物理页码（1 基，随更新漂移）。 */
  readonly tocPages: ReadonlyMap<string, number>;
  readonly pageCount: number;
  /** 目录页物理页号（0 基）；初次定位不唯一则为 null（页码变化时 fail-closed）。 */
  readonly tocPageIndex: number | null;
}

/** 页级证据等价（tag-free 键口径见 incremental.ts runKeyTagFree / ADR-0033 §4）。 */
export function pagesEquivalentTagFree(
  a: readonly GeometryTextRun[],
  b: readonly GeometryTextRun[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (
      runKeyTagFree(a[index] as GeometryTextRun) !==
      runKeyTagFree(b[index] as GeometryTextRun)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * 目录页定位（0 基）：某页存在归一化拼接后恰等于栏目标题的**连续 run 窗**，且
 * 全文档唯一。字距排版下标题会拆成单字 run 序列（如 “目”+“录”，实测于签署
 * 语料），故按连续窗拼接匹配而非单 run 相等；为排除封面/正文中同以拆字形态
 * 出现的「目录」二字（实测：封面说明行内嵌「目录」），要求窗口**独立成行**：
 * 窗内非空 run 同基线，且前后最近非空邻 run 均不在该基线上。多页命中/零命中
 * 均返回 null（页码变化时调用方 fail-closed）。
 */
export function locateTocPageIndex(geometry: PdfGeometry): number | null {
  const hits = new Set<number>();
  for (const page of geometry.pages) {
    const runs = pageRuns(geometry, page.index);
    const normalized = runs.map((run) => normalizePdfText(run.text));
    for (let from = 0; from < runs.length; from += 1) {
      let joined = "";
      let to = from;
      while (to < runs.length && joined.length < TOC_HEADING.length) {
        joined += normalized[to] as string;
        to += 1;
      }
      if (joined !== TOC_HEADING) {
        continue;
      }
      const baseline = (runs[from] as GeometryTextRun).baselineY;
      const inWindowSameLine = runs
        .slice(from, to)
        .every(
          (run, offset) =>
            (normalized[from + offset] as string).length === 0 ||
            run.baselineY === baseline,
        );
      const before = runs
        .slice(0, from)
        .findLast((run, offset) => (normalized[offset] as string).length > 0);
      const afterIndex = runs.findIndex(
        (run, offset) => offset >= to && (normalized[offset] as string).length > 0,
      );
      const isolated =
        inWindowSameLine &&
        (before === undefined || before.baselineY !== baseline) &&
        (afterIndex === -1 ||
          (runs[afterIndex] as GeometryTextRun).baselineY !== baseline);
      if (isolated) {
        hits.add(page.index);
      }
    }
  }
  return hits.size === 1 ? ([...hits][0] as number) : null;
}

/** 窗页合并：旧几何中窗页的 run/figure 替换为新证据（页码已重基）。 */
export function mergeWindowGeometry(
  old: PdfGeometry,
  newWindowRuns: readonly GeometryTextRun[],
  newWindowFigures: PdfGeometry["figures"],
): PdfGeometry {
  const newPages = new Set(newWindowRuns.map((r) => r.pageIndex));
  const keptRuns = old.textRuns.filter((run) => !newPages.has(run.pageIndex));
  const merged = [...keptRuns, ...newWindowRuns].sort(
    (a, b) => a.pageIndex - b.pageIndex,
  );
  const keptFigures = old.figures.filter((figure) => !newPages.has(figure.pageIndex));
  return Object.freeze({
    pages: old.pages,
    textRuns: Object.freeze(merged),
    figures: Object.freeze([...keptFigures, ...newWindowFigures]),
  });
}

/**
 * 增量成功后的状态合并（新快照）：窗页 run/figure 重基到全文档页号后替换旧
 * 几何窗页，证据索引重建；contentBytes 置 null（整份字节不再是当前态真源），
 * displayBytes/tocPageIndex 沿用（未受影响页显示源不变）。
 */
export function applyWindowToState(input: {
  readonly current: PreviewState;
  readonly windowGeometry: PdfGeometry;
  /** 收束窗口起点（0 基，全文档页号）。 */
  readonly windowStart: number;
  readonly newWindowPages: number;
  readonly newPageCount: number;
  readonly newDocument: WenshuDocument;
  readonly newTocPages: ReadonlyMap<string, number>;
}): PreviewState {
  const rebasedRuns = input.windowGeometry.textRuns
    .filter((run) => run.pageIndex < input.newWindowPages)
    .map((run) =>
      Object.freeze({ ...run, pageIndex: input.windowStart + run.pageIndex }),
    );
  const rebasedFigures = input.windowGeometry.figures
    .filter((figure) => figure.pageIndex < input.newWindowPages)
    .map((figure) =>
      Object.freeze({ ...figure, pageIndex: input.windowStart + figure.pageIndex }),
    );
  const geometry = mergeWindowGeometry(
    input.current.geometry,
    Object.freeze(rebasedRuns),
    Object.freeze(rebasedFigures),
  );
  return Object.freeze({
    document: input.newDocument,
    contentBytes: null,
    displayBytes: input.current.displayBytes,
    geometry,
    pageTextIndex: buildPageTextIndex(geometry),
    tocPages: input.newTocPages,
    pageCount: input.newPageCount,
    tocPageIndex: input.current.tocPageIndex,
  });
}

/** 初次导出状态构建（produceBaselinePdf 输出 + 文档模型）。 */
export function buildInitialPreviewState(input: {
  readonly document: WenshuDocument;
  readonly contentBytes: Uint8Array;
  readonly displayBytes: Uint8Array;
  readonly tocPages: ReadonlyMap<string, number>;
  readonly pageCount: number;
}): PreviewState {
  const geometry = extractGeometry(input.contentBytes);
  const pageTextIndex = buildPageTextIndex(geometry);
  return Object.freeze({
    document: input.document,
    contentBytes: input.contentBytes,
    displayBytes: input.displayBytes,
    geometry,
    pageTextIndex,
    tocPages: input.tocPages,
    pageCount: input.pageCount,
    tocPageIndex: locateTocPageIndex(geometry),
  });
}
