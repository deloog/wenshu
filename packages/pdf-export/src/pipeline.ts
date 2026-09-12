import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { TOC_HEADING } from "@wenshu/document-model";
import {
  launchBrowser,
  type BrowserSession,
  startStaticServer,
} from "@wenshu/report-render";

import { backfillTocPageNumbers } from "./backfill-toc.ts";
import { fillTocPlaceholders } from "./compose.ts";
import { assertNotCancelled, type PipelineCancellation } from "./cancellation.ts";
import { repairPdfTextLayer } from "./cmap-repair.ts";
import { PdfExportError } from "./errors.ts";
import { inspectPdf, type PdfInspection } from "./inspect.ts";
import { measureTocPageNumbers } from "./pagination.ts";
import { prepareExportContext } from "./prepare-context.ts";
import {
  buildExpectedPdfText,
  extractSvgText,
  assertPdfReconciled,
} from "./reconcile.ts";
import type { PrintParams } from "./print-params.ts";
import {
  stampRunningHeaders,
  stripStampsForReconcile,
  type StampSpec,
} from "./stamp.ts";

export interface BaselineInput {
  readonly fixture: string;
  readonly fixtureRoot: string;
  readonly fontDir: string;
  readonly templatePath: string;
  readonly browserPath?: string | undefined;
  /** 平台壳提供的真实浏览器会话（PA-14E）；未提供时保持 Chromium 启动路径。 */
  readonly createBrowser?: (() => Promise<BrowserSession>) | undefined;
}

/** 渲染段子分段耗时（A-04E 评估测量，additive；只包计时，不改变任何调用序列）。 */
export interface RenderBreakdown {
  /** 静态服务器启动（含导出文档装配与读取），自渲染段起点起算。 */
  readonly serverMs: number;
  /** 浏览器会话接入（launchBrowser 或平台壳会话）与产品版本读取。 */
  readonly browserMs: number;
  /** 首遍 navigate+printToPDF+目录页码测量；无目录时为 0（唯一一遍计入 finalPassMs）。 */
  readonly firstPassMs: number;
  /** 稳定化轮逐轮耗时（fill+navigate+print+重测，按轮序）；收敛轮即最后一遍。 */
  readonly stabilizationRoundMs: readonly number[];
  /** 无目录时的唯一一遍 navigate+printToPDF；有目录时为 0（最后一遍见上）。 */
  readonly finalPassMs: number;
  /** 渲染段收尾：finally 块内浏览器关闭+静态服务器关闭。 */
  readonly teardownMs: number;
}

/** 管线分段耗时（PA-13 性能采样口径；毫秒，performance.now 单调钟）。 */
export interface PipelineTimings {
  /** 导入+字体/模板/CSS/compose+资源读取。 */
  readonly importMs: number;
  /** 渲染段：静态服务器+浏览器启动+排版打印（含目录两遍渲染）。 */
  readonly renderMs: number;
  /** 后处理：期望文本装配+文本层修复+压印+终检。 */
  readonly postprocessMs: number;
  readonly totalMs: number;
  /** 渲染段子分段（additive 观测字段；renderMs 语义不变）。 */
  readonly renderBreakdown: RenderBreakdown;
}

export interface BaselineOutput {
  readonly pdfBytes: Uint8Array;
  readonly browserProduct: string;
  readonly printParams: PrintParams;
  readonly inspection: PdfInspection;
  /** 分段耗时（additive，仅观测不改变产物）。 */
  readonly timings: PipelineTimings;
  /** 终稿提取文本（压印页眉页脚已位置锚定剥离），可直接逐字对账。 */
  readonly extractedText: string;
  readonly expectedText: string;
  /** 跨页重绘表头（CSS table-header-group 设计行为，对账跳过）。 */
  readonly repeatables: readonly string[];
  /** 目录条目锚定章节 id → 实测物理页码（两遍渲染测量，PA-11A）。 */
  readonly tocPages: ReadonlyMap<string, number>;
  /** 文本层修复统计（洞/错标修补在管线内完成；签署基线预期 0 触发）。 */
  readonly repair: { readonly repairedHoles: number; readonly patchedObjects: number };
  /** 压印前内容字节（目录回填+文本层修复之后、页眉页脚压印之前的内容真源，A-04E-2b additive）。 */
  readonly contentBytes: Uint8Array;
  /** 管线实际使用的压印参数（模板派生，A-04E-2b additive）。 */
  readonly stampSpec: StampSpec;
}

const MM_TO_PT = 72 / 25.4;

/**
 * PA-05 基线导出管线：固定 fixture → 语义 HTML → 白名单 CSS → 真实 Chromium printToPDF。
 * PA-11A 扩展：目录页码两遍渲染测量注入（页码=实测物理页，禁手写，≤3 轮不动点）、
 * 文本层修复、页眉页脚 PDF 层压印（受控补偿）与终稿自核验。只产出与检查，不写文件。
 */
export async function produceBaselinePdf(
  input: BaselineInput,
  cancellation?: PipelineCancellation,
): Promise<BaselineOutput> {
  const totalStart = performance.now();
  assertNotCancelled(cancellation, "import");
  const importStart = performance.now();
  const context = await prepareExportContext(input);
  const { imported, model, printParams, tocEntries, basePrintHtml } = context;
  const importMs = performance.now() - importStart;

  assertNotCancelled(cancellation, "compose");
  const renderStart = performance.now();
  const documents: Record<string, string | Uint8Array> = {
    // 决策 #21：带目录文档 compose 期即填入占位数字 888，整份只渲染一遍；
    // 实测页码事后经 backfillTocPageNumbers 字节级原地回填（布局不重排）。
    "/print.html":
      tocEntries.length === 0
        ? basePrintHtml
        : fillTocPlaceholders(basePrintHtml, tocEntries),
  };
  for (const [original, normalized] of Object.entries(imported.renames)) {
    documents[`/${normalized}`] = await readFile(resolve(input.fixtureRoot, original));
  }
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: input.fontDir }],
    documents,
  );
  // A-04E 子分段计时：以下变量只观测，渲染调用序列与传参保持原样。
  const serverMs = performance.now() - renderStart;
  let browserMs: number;
  let firstPassMs = 0;
  const stabilizationRoundMs: number[] = [];
  let finalPassMs = 0;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  // 会话所有权（决策 #19 出口 1 持久会话接缝）：createBrowser 提供的会话归
  // 调用方所有（跨导出复用），管线绝不 close；自建会话才由管线关闭。
  const ownsBrowser = input.createBrowser === undefined;
  let pdfBytes: Uint8Array;
  let browserProduct: string;
  let tocPages: ReadonlyMap<string, number> = new Map();
  let teardownMs: number;
  try {
    const browserStart = performance.now();
    const session = await (input.createBrowser === undefined
      ? launchBrowser(input.browserPath, { signal: cancellation?.signal })
      : input.createBrowser());
    browser = session;
    browserProduct = await session.productVersion();
    browserMs = performance.now() - browserStart;
    if (tocEntries.length === 0) {
      const passStart = performance.now();
      await session.navigate(`${server.origin}/print.html`);
      pdfBytes = await session.printToPdf({ ...printParams });
      finalPassMs = performance.now() - passStart;
    } else {
      // 单遍（决策 #21）：占位数字已随 compose 填充，渲染一遍后大纲测量即终值
      // （不回填 HTML、不重渲，布局不变，测量不存在不收敛形态）。插桩语义：
      // firstPassMs = 唯一渲染遍；stabilizationRoundMs 退役为空数组；finalPassMs=0。
      const passStart = performance.now();
      await session.navigate(`${server.origin}/print.html`);
      pdfBytes = await session.printToPdf({ ...printParams });
      tocPages = measureTocPageNumbers(pdfBytes, tocEntries);
      firstPassMs = performance.now() - passStart;
    }
  } catch (error) {
    // 统一取消终态码：渲染段任何来源的取消都以 PDF_EXPORT_CANCELLED 结案。
    if (
      error instanceof Error &&
      (error as { readonly code?: unknown }).code === "RENDER_CANCELLED"
    ) {
      throw new PdfExportError(
        "PDF_EXPORT_CANCELLED",
        "baseline export cancelled at stage: render",
      );
    }
    throw error;
  } finally {
    const teardownStart = performance.now();
    if (ownsBrowser) {
      await browser?.close();
    }
    await server.close();
    teardownMs = performance.now() - teardownStart;
  }
  const renderMs = performance.now() - renderStart;

  assertNotCancelled(cancellation, "render");
  const postprocessStart = performance.now();
  const svgTexts = await Promise.all(
    Object.keys(imported.renames).map(async (original) =>
      extractSvgText(await readFile(resolve(input.fixtureRoot, original), "utf8")),
    ),
  );
  const expected = buildExpectedPdfText(
    imported.document,
    svgTexts,
    tocEntries.length === 0
      ? undefined
      : { heading: TOC_HEADING, entries: tocEntries, pages: tocPages },
  );

  // 目录页码字节级原地回填（决策 #21，对账前）→ 文本层修复 → 页眉页脚压印
  // → 终稿逐项自核验。回填后提取文本即含实测页码，与期望文本同位。
  const backfilled =
    tocEntries.length === 0
      ? pdfBytes
      : backfillTocPageNumbers(pdfBytes, tocEntries, tocPages);
  const repair = repairPdfTextLayer(backfilled, expected.text, expected.repeatables);
  const margins = model.page.margin_mm;
  const pageSize = inspectPdf(repair.pdfBytes).pageSizePt;
  const stampSpec: StampSpec = Object.freeze({
    headerText: imported.metadata["short_title"] ?? "",
    pageWidthPt: pageSize[0] ?? 0,
    pageHeightPt: pageSize[1] ?? 0,
    marginTopPt: margins.top * MM_TO_PT,
    marginBottomPt: margins.bottom * MM_TO_PT,
    marginLeftPt: margins.left * MM_TO_PT,
  });
  const finalBytes = stampRunningHeaders(repair.pdfBytes, stampSpec);
  const inspection = inspectPdf(finalBytes);
  const strippedText = stripStampsForReconcile(
    inspection.pages.map((page) => page.text),
    stampSpec,
  );
  assertPdfReconciled(strippedText, expected.text, expected.repeatables);
  const postprocessMs = performance.now() - postprocessStart;

  return Object.freeze({
    pdfBytes: finalBytes,
    browserProduct,
    printParams,
    inspection,
    timings: Object.freeze({
      importMs,
      renderMs,
      postprocessMs,
      totalMs: performance.now() - totalStart,
      renderBreakdown: Object.freeze({
        serverMs,
        browserMs,
        firstPassMs,
        stabilizationRoundMs: Object.freeze([...stabilizationRoundMs]),
        finalPassMs,
        teardownMs,
      }),
    }),
    extractedText: strippedText,
    expectedText: expected.text,
    repeatables: expected.repeatables,
    tocPages,
    repair: Object.freeze({
      repairedHoles: repair.repairedHoles,
      patchedObjects: repair.patchedObjects,
    }),
    contentBytes: repair.pdfBytes,
    stampSpec,
  });
}
