import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  TOC_HEADING,
  collectTocEntries,
  type WenshuDocument,
} from "@wenshu/document-model";
import {
  renderDocumentHtml,
  startStaticServer,
  type BrowserSession,
  type RenderTarget,
} from "@wenshu/report-render";

import { backfillTocPageNumbers } from "./backfill-toc.ts";
import { assertNotCancelled, type PipelineCancellation } from "./cancellation.ts";
import { composePrintDocument, fillTocPlaceholders } from "./compose.ts";
import { repairPdfTextLayer } from "./cmap-repair.ts";
import { PdfExportError } from "./errors.ts";
import { inspectPdf } from "./inspect.ts";
import { measureTocPageNumbers } from "./pagination.ts";
import type { ExportContext } from "./prepare-context.ts";
import {
  assertPdfReconciled,
  buildExpectedPdfText,
  extractSvgText,
} from "./reconcile.ts";
import {
  stampRunningHeaders,
  stripStampsForReconcile,
  type StampSpec,
} from "./stamp.ts";

/**
 * A-04E-2b 整份渲染（文档模型直驱）：produceBaselinePdf 的渲染+后处理语义在
 * 「文档已在内存」形态下的复刻——增量控制器 full-required 回落路径与对账
 * oracle 共用此实现（单源，防两套整份语义漂移）。
 * 与签署管线的差异仅在输入来源（文档模型 vs markdown 文件）：装配产物全部
 * 来自同一 ExportContext；渲染/测量/回填/修复/压印/对账调用序列逐项一致。
 */

export interface FullRenderOutput {
  /** 压印前整份字节（backfill+repair 后）——增量缓存的内容真源。 */
  readonly contentBytes: Uint8Array;
  /** 压印后终稿字节。 */
  readonly finalBytes: Uint8Array;
  readonly tocPages: ReadonlyMap<string, number>;
  readonly pageCount: number;
  readonly repair: { readonly repairedHoles: number; readonly patchedObjects: number };
  readonly timings: {
    readonly serverMs: number;
    readonly navigateMs: number;
    readonly printMs: number;
    readonly postMs: number;
    readonly totalMs: number;
  };
}

export interface FullRenderOptions {
  /**
   * 独立渲染 target（A-04E-2-P6，决策 #27 D3）：提供时 navigate/printToPdf
   * 在该 target 上执行，取消主路径 = 调用方关闭该 target（在途命令以
   * RENDER_TARGET_CLOSED 拒绝，本函数在 signal 已中止时归一译为
   * PDF_EXPORT_CANCELLED；signal 未中止时原样抛出，绝不误译真实失败）。
   * 不提供时与既有行为逐字等价（会话本体执行）。
   */
  readonly renderTarget?: RenderTarget;
}

export async function renderDocumentFull(
  context: ExportContext,
  session: BrowserSession,
  document: WenshuDocument,
  stampSpec: StampSpec,
  cancellation?: PipelineCancellation,
  options?: FullRenderOptions,
): Promise<FullRenderOutput> {
  const totalStart = performance.now();
  assertNotCancelled(cancellation, "compose");
  const serverStart = performance.now();
  const tocEntries = collectTocEntries(document);
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
  const printHtml =
    tocEntries.length === 0 ? base : fillTocPlaceholders(base, tocEntries);
  const documents: Record<string, string | Uint8Array> = { "/print.html": printHtml };
  for (const [original, normalized] of Object.entries(context.imported.renames)) {
    documents[`/${normalized}`] = await readFile(
      resolve(context.fixtureRoot, original),
    );
  }
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: context.fontDir }],
    documents,
  );
  const serverMs = performance.now() - serverStart;

  let pdfBytes: Uint8Array;
  let navigateMs: number;
  let printMs: number;
  // 执行面：独立 target（提供时）或会话本体（缺省，既有行为）。
  const executor: Pick<BrowserSession, "navigate" | "printToPdf"> =
    options?.renderTarget ?? session;
  try {
    assertNotCancelled(cancellation, "render");
    const navStart = performance.now();
    await executor.navigate(`${server.origin}/print.html`);
    navigateMs = performance.now() - navStart;
    const printStart = performance.now();
    pdfBytes = await executor.printToPdf({ ...context.printParams });
    printMs = performance.now() - printStart;
  } catch (error) {
    const code = (error as { readonly code?: unknown } | null)?.code;
    if (
      error instanceof Error &&
      (code === "RENDER_CANCELLED" ||
        // target 关闭杀在途命令：仅当取消信号已中止才译为取消终态码
        // （非取消原因的 target 失败原样抛出，不得冒充取消）。
        (code === "RENDER_TARGET_CLOSED" && cancellation?.signal?.aborted === true))
    ) {
      throw new PdfExportError(
        "PDF_EXPORT_CANCELLED",
        "full render cancelled at stage: render",
      );
    }
    throw error;
  } finally {
    await server.close();
  }

  assertNotCancelled(cancellation, "postprocess");
  const postStart = performance.now();
  const tocPages =
    tocEntries.length === 0
      ? new Map<string, number>()
      : measureTocPageNumbers(pdfBytes, tocEntries);
  const backfilled =
    tocEntries.length === 0
      ? pdfBytes
      : backfillTocPageNumbers(pdfBytes, tocEntries, tocPages);
  const svgTexts = [...context.svgCache.values()].map((svg) => extractSvgText(svg));
  const expected = buildExpectedPdfText(
    document,
    svgTexts,
    tocEntries.length === 0
      ? undefined
      : { heading: TOC_HEADING, entries: tocEntries, pages: tocPages },
  );
  const repair = repairPdfTextLayer(backfilled, expected.text, expected.repeatables);
  const finalBytes = stampRunningHeaders(repair.pdfBytes, stampSpec);
  const inspection = inspectPdf(finalBytes);
  const strippedText = stripStampsForReconcile(
    inspection.pages.map((page) => page.text),
    stampSpec,
  );
  assertPdfReconciled(strippedText, expected.text, expected.repeatables);
  const postMs = performance.now() - postStart;

  return Object.freeze({
    contentBytes: repair.pdfBytes,
    finalBytes,
    tocPages,
    pageCount: inspection.pageCount,
    repair: Object.freeze({
      repairedHoles: repair.repairedHoles,
      patchedObjects: repair.patchedObjects,
    }),
    timings: Object.freeze({
      serverMs,
      navigateMs,
      printMs,
      postMs,
      totalMs: performance.now() - totalStart,
    }),
  });
}
