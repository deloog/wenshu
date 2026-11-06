import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  collectTocEntries,
  type TocEntry,
  type WenshuDocument,
} from "@wenshu/document-model";
import {
  renderDocumentHtml,
  startStaticServer,
  type BrowserSession,
} from "@wenshu/report-render";

import { backfillTocPageNumbers } from "./backfill-toc.ts";
import { assertNotCancelled, type PipelineCancellation } from "./cancellation.ts";
import { composePrintDocument, fillTocPlaceholders } from "./compose.ts";
import { PdfExportError } from "./errors.ts";
import { extractGeometry, type PdfGeometry } from "./geometry.ts";
import {
  evaluateCascade,
  initialWindowEnd,
  locateAnchorPage,
  pageRuns,
  recomputeTocPagesAfterWindow,
  resolveEditAnchor,
  tocPagesDrifted,
} from "./incremental.ts";
import {
  applyWindowToState,
  pagesEquivalentTagFree,
  type PreviewState,
} from "./incremental-state.ts";
import type { ExportContext } from "./prepare-context.ts";

export type { PreviewState } from "./incremental-state.ts";
export { buildInitialPreviewState } from "./incremental-state.ts";

/**
 * A-04E-2b 增量预览控制器（ADR-0033；IO 驱动半，纯逻辑在 incremental.ts）。
 *
 * 状态纪律：
 * - 页槽缓存 = 旧整份终态字节（未受影响页的显示源）+ 本次窗格 PDF（受影响页
 *   的新显示源）。**不做跨文档 PDF 拼接**；终稿导出永远走整份签署管线。
 * - 逐页证据索引（pageTextIndex/geometry）随每次增量成功就地合并更新，后续
 *   编辑的锚定与哨兵比对永远面对当前真实状态，不是初次状态的幻影。
 * - delta≠0（页数变化）本棒不发明旧尾页改号压印：诚实退 `full-required`
 *   （后台整份重排路径，ADR-0014 ①③ 由此 exercised），不静默产出错页码预览。
 * - 窗格产物不压印（机制实证：ranged print 的字体子集只含窗页字形，页眉
 *   short_title 字符无忠实字形表示，resolveStampReps fail-closed）；压印属
 *   交付层，预览显示层以绝对页码统一覆盖页眉页脚（决策 #25 工装职责）。
 * - 诚实性插桩：`pageRangesPrinted` 逐轮记录真实打印区间——报「增量」的更新
 *   必须真的只打了窗页，审计可据此判定假增量。
 */

export interface IncrementalTimings {
  readonly composeMs: number;
  readonly navigateMs: number;
  /** 逐轮 ranged print 耗时（与 pageRangesPrinted 对齐）。 */
  readonly printMs: readonly number[];
  readonly postMs: number;
  readonly totalMs: number;
}

export type IncrementalUpdateResult =
  | {
      readonly kind: "incremental";
      /** 受影响页区间（1 基闭区间，ux-state updatedPageRange 语义）。 */
      readonly updatedRange: readonly [number, number];
      readonly pageCount: number;
      readonly tocPages: ReadonlyMap<string, number>;
      /** 窗格 PDF（内容级字节未压印；前 windowPages 页为窗页，其后为哨兵页——哨兵页与旧页等价，仅作比对副产，展示侧不使用）。 */
      readonly windowPdfBytes: Uint8Array;
      readonly windowPages: number;
      /** 目录页槽（占位回填+压印后）；页码无漂移为 null。 */
      readonly tocSlotPdfBytes: Uint8Array | null;
      /** 逐轮真实打印区间（诚实性插桩）。 */
      readonly pageRangesPrinted: readonly string[];
      readonly timings: IncrementalTimings;
    }
  | {
      readonly kind: "full-required";
      /** 退整份重排的诚实理由（级联超界/页数变化/定位歧义等）。 */
      readonly reason: string;
      readonly pageRangesPrinted: readonly string[];
      readonly timings: IncrementalTimings;
    };

export interface IncrementalPreviewDeps {
  readonly session: BrowserSession;
  readonly context: ExportContext;
}

export interface IncrementalPreviewController {
  readonly state: () => PreviewState;
  readonly update: (
    newDocument: WenshuDocument,
    affectedNodeIds: readonly string[],
    cancellation?: PipelineCancellation,
  ) => Promise<IncrementalUpdateResult>;
}

export function createIncrementalPreviewController(
  deps: IncrementalPreviewDeps,
  initial: PreviewState,
): IncrementalPreviewController {
  let current = initial;
  const { context } = deps;

  const composeNewHtml = (document: WenshuDocument): string => {
    const base = composePrintDocument(
      renderDocumentHtml(document),
      context.css,
      (assetPath) => {
        const original = Object.entries(context.imported.renames).find(
          ([, normalized]) => normalized === assetPath,
        )?.[0];
        return original === undefined ? undefined : context.svgCache.get(original);
      },
    );
    // 占位填充以新文档的目录条目为准（条目集守卫已在 update 入口钉定不变式）
    const entries = collectTocEntries(document);
    return entries.length === 0 ? base : fillTocPlaceholders(base, entries);
  };

  const update = async (
    newDocument: WenshuDocument,
    affectedNodeIds: readonly string[],
    cancellation?: PipelineCancellation,
  ): Promise<IncrementalUpdateResult> => {
    const totalStart = performance.now();
    const pageRangesPrinted: string[] = [];
    const printMs: number[] = [];
    const timingsOf = (
      composeMs: number,
      navigateMs: number,
      postMs: number,
    ): IncrementalTimings =>
      Object.freeze({
        composeMs,
        navigateMs,
        printMs: Object.freeze([...printMs]),
        postMs,
        totalMs: performance.now() - totalStart,
      });
    const fullRequired = (
      reason: string,
      composeMs: number,
      navigateMs: number,
      postMs: number,
    ): IncrementalUpdateResult =>
      Object.freeze({
        kind: "full-required",
        reason,
        pageRangesPrinted: Object.freeze([...pageRangesPrinted]),
        timings: timingsOf(composeMs, navigateMs, postMs),
      });

    let composeMs = 0;
    let navigateMs = 0;
    try {
      assertNotCancelled(cancellation, "compose");
      if (affectedNodeIds.length === 0) {
        return fullRequired("no affected nodes reported (empty edit set)", 0, 0, 0);
      }

      // 目录条目集合守卫：标题改/增/删即目录结构变化，占位回填口径不再成立，诚实退整份
      const newTocEntries = collectTocEntries(newDocument);
      const entryKey = (entries: readonly TocEntry[]): string =>
        entries
          .map((entry) => `${entry.id} ${entry.level} ${entry.title}`)
          .join("\u001f");
      if (entryKey(newTocEntries) !== entryKey(context.tocEntries)) {
        return fullRequired(
          "toc entry set changed (heading edited/added/removed)",
          0,
          0,
          0,
        );
      }

      // ---- 受影响区定位（旧状态证据，fail-closed） ----
      const anchorPages = affectedNodeIds.map((id) =>
        locateAnchorPage(
          current.pageTextIndex,
          resolveEditAnchor(current.document, newDocument, id),
          `node ${id}`,
        ),
      );
      const windowStart = Math.min(...anchorPages);
      // P7（A-04E-2c，业主裁定采纳）：首窗放宽一页；哨兵比对/级联延伸不变
      let windowEnd = initialWindowEnd(Math.max(...anchorPages));
      if (current.tocPageIndex !== null && windowStart <= current.tocPageIndex) {
        // 编辑触及目录页或之前：目录页自身位置可能移位，v1 诚实退整份
        return fullRequired(
          "edit at or before TOC page may shift the TOC page itself",
          0,
          0,
          0,
        );
      }

      // ---- 重组装 + 热导航（持久会话，冷启动只付一次的 2a 形态） ----
      const composeStart = performance.now();
      const printHtml = composeNewHtml(newDocument);
      const documents: Record<string, string | Uint8Array> = {
        "/print.html": printHtml,
      };
      for (const [original, normalized] of Object.entries(context.imported.renames)) {
        documents[`/${normalized}`] = await readFile(
          resolve(context.fixtureRoot, original),
        );
      }
      const server = await startStaticServer(
        [{ mount: "/fonts/", directory: context.fontDir }],
        documents,
      );
      composeMs = performance.now() - composeStart;
      let closed:
        | {
            readonly newWindowPages: number;
            readonly newPageCount: number;
            readonly delta: number;
            readonly degeneratedToFull: boolean;
          }
        | undefined;
      let windowBytes: Uint8Array | undefined;
      let windowGeometry: PdfGeometry | undefined;
      try {
        assertNotCancelled(cancellation, "render");
        const navStart = performance.now();
        await deps.session.navigate(`${server.origin}/print.html`);
        navigateMs = performance.now() - navStart;

        // ---- 哨兵级联循环（终止性由 evaluateCascade 的 EOF 收束保证） ----
        for (;;) {
          const range = `${windowStart + 1}-${windowEnd + 2}`;
          const printStart = performance.now();
          let bytes: Uint8Array;
          try {
            bytes = await deps.session.printToPdf({
              ...context.printParams,
              pageRanges: range,
            });
          } catch (error) {
            // CDP 全越界（窗口起点已超新文档总页数=巨幅收缩）→ 诚实退整份
            if (
              error instanceof Error &&
              error.message.includes("Page range exceeds page count")
            ) {
              return fullRequired(
                `new document ends before window start ${windowStart + 1} (massive shrink)`,
                composeMs,
                navigateMs,
                0,
              );
            }
            throw error;
          }
          printMs.push(performance.now() - printStart);
          pageRangesPrinted.push(range);
          const geometry = extractGeometry(bytes);
          const requested = windowEnd - windowStart + 2;
          let sentinelEqual: boolean | null = null;
          if (
            geometry.pages.length === requested &&
            windowEnd + 1 < current.pageCount
          ) {
            sentinelEqual = pagesEquivalentTagFree(
              pageRuns(geometry, requested - 1),
              pageRuns(current.geometry, windowEnd + 1),
            );
          }
          const step = evaluateCascade({
            windowStart,
            windowEnd,
            oldPageCount: current.pageCount,
            printedPages: geometry.pages.length,
            sentinelEqual,
          });
          if (step.kind === "fallback") {
            return fullRequired(step.reason, composeMs, navigateMs, 0);
          }
          if (step.kind === "extend") {
            windowEnd = step.newWindowEnd;
            continue;
          }
          closed = step;
          windowBytes = bytes;
          windowGeometry = geometry;
          break;
        }
      } finally {
        await server.close();
      }
      assertNotCancelled(cancellation, "postprocess");
      const postStart = performance.now();

      if (closed.degeneratedToFull) {
        return fullRequired(
          "affected window degenerated to the whole document",
          composeMs,
          navigateMs,
          0,
        );
      }
      if (closed.delta !== 0) {
        // ADR-0033 D4 边界：页数变化不发明旧尾页改号压印，诚实退整份重排
        return fullRequired(
          `page-count delta ${closed.delta} requires full repagination (restamping deferred)`,
          composeMs,
          navigateMs,
          0,
        );
      }

      // ---- 目录页码更新（delta=0：窗内锚定重定位，窗后不变） ----
      const newTocPages = recomputeTocPagesAfterWindow({
        entries: newTocEntries,
        tocPages: current.tocPages,
        windowStart,
        oldWindowPages: windowEnd - windowStart + 1,
        newWindowGeometry: windowGeometry as PdfGeometry,
        newWindowPages: closed.newWindowPages,
        delta: closed.delta,
      });

      // ---- 目录页槽更新（页码漂移时：重打目录页 + 占位回填 + 压印） ----
      let tocSlotPdfBytes: Uint8Array | null = null;
      if (tocPagesDrifted(current.tocPages, newTocPages)) {
        if (current.tocPageIndex === null) {
          return fullRequired(
            "toc pages drifted but TOC page index is not uniquely located",
            composeMs,
            navigateMs,
            0,
          );
        }
        const tocRange = `${current.tocPageIndex + 1}-${current.tocPageIndex + 1}`;
        const tocPrintStart = performance.now();
        const tocBytes = await deps.session.printToPdf({
          ...context.printParams,
          pageRanges: tocRange,
        });
        printMs.push(performance.now() - tocPrintStart);
        pageRangesPrinted.push(tocRange);
        const backfilled = backfillTocPageNumbers(tocBytes, newTocEntries, newTocPages);
        tocSlotPdfBytes = backfilled;
      }

      // ---- 状态合并（证据索引就地更新，后续编辑面对真实当前态） ----
      current = applyWindowToState({
        current,
        windowGeometry: windowGeometry as PdfGeometry,
        windowStart,
        newWindowPages: closed.newWindowPages,
        newPageCount: closed.newPageCount,
        newDocument,
        newTocPages,
      });

      const postMs = performance.now() - postStart;
      return Object.freeze({
        kind: "incremental",
        updatedRange: Object.freeze([
          windowStart + 1,
          windowStart + closed.newWindowPages,
        ]) as readonly [number, number],
        pageCount: closed.newPageCount,
        tocPages: newTocPages,
        windowPdfBytes: windowBytes as Uint8Array,
        windowPages: closed.newWindowPages,
        tocSlotPdfBytes,
        pageRangesPrinted: Object.freeze([...pageRangesPrinted]),
        timings: timingsOf(composeMs, navigateMs, postMs),
      });
    } catch (error) {
      if (
        error instanceof PdfExportError &&
        error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK"
      ) {
        return fullRequired(error.message, composeMs, navigateMs, 0);
      }
      throw error;
    }
  };

  return Object.freeze({ state: () => current, update });
}
