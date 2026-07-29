import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { TOC_HEADING, collectTocEntries } from "@wenshu/document-model";
import { importMarkdownDocument } from "@wenshu/markdown-import";
import {
  launchBrowser,
  type BrowserSession,
  parseFontPlan,
  renderDocumentHtml,
  startStaticServer,
  verifyFontFiles,
} from "@wenshu/report-render";
import { renderTemplateCss } from "@wenshu/template-css";
import { mapTemplate, parseApprovedFontSet } from "@wenshu/template-map";

import { composePrintDocument, fillTocPageNumbers } from "./compose.ts";
import { assertNotCancelled, type PipelineCancellation } from "./cancellation.ts";
import { repairPdfTextLayer } from "./cmap-repair.ts";
import { PdfExportError } from "./errors.ts";
import { inspectPdf, type PdfInspection } from "./inspect.ts";
import { measureTocPageNumbers, resolveStableTocPages } from "./pagination.ts";
import {
  buildExpectedPdfText,
  extractSvgText,
  assertPdfReconciled,
} from "./reconcile.ts";
import { buildPrintParams, type PrintParams } from "./print-params.ts";
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

/** 管线分段耗时（PA-13 性能采样口径；毫秒，performance.now 单调钟）。 */
export interface PipelineTimings {
  /** 导入+字体/模板/CSS/compose+资源读取。 */
  readonly importMs: number;
  /** 渲染段：静态服务器+浏览器启动+排版打印（含目录两遍渲染）。 */
  readonly renderMs: number;
  /** 后处理：期望文本装配+文本层修复+压印+终检。 */
  readonly postprocessMs: number;
  readonly totalMs: number;
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
  const imported = await importMarkdownDocument(input.fixture, input.fixtureRoot);
  const manifest = JSON.parse(
    await readFile(resolve(input.fontDir, "font-manifest.json"), "utf8"),
  );
  const plan = parseFontPlan(manifest);
  await verifyFontFiles(input.fontDir, plan);

  const fontSet = parseApprovedFontSet(manifest);
  if (!fontSet.ok) {
    throw new Error("font manifest must parse");
  }
  const mapped = mapTemplate(
    JSON.parse(await readFile(input.templatePath, "utf8")),
    fontSet.value,
  );
  if (!mapped.ok) {
    throw new Error(`template must map: ${JSON.stringify(mapped.issues)}`);
  }
  const model = mapped.value;
  const css = renderTemplateCss(
    model,
    plan.map((face) => ({ weight: face.weight, src: `fonts/${face.fileName}` })),
  );
  const svgCache = new Map<string, string>();
  for (const original of Object.keys(imported.renames)) {
    if (original.toLowerCase().endsWith(".svg")) {
      svgCache.set(
        original,
        new TextDecoder().decode(await readFile(resolve(input.fixtureRoot, original))),
      );
    }
  }
  const basePrintHtml = composePrintDocument(
    renderDocumentHtml(imported.document),
    css,
    (assetPath) => {
      const original = Object.entries(imported.renames).find(
        ([, normalized]) => normalized === assetPath,
      )?.[0];
      if (original === undefined) {
        return undefined;
      }
      return svgCache.get(original);
    },
  );
  const printParams = buildPrintParams(model);
  const tocEntries = collectTocEntries(imported.document);
  const importMs = performance.now() - importStart;

  assertNotCancelled(cancellation, "compose");
  const renderStart = performance.now();
  const documents: Record<string, string | Uint8Array> = {
    "/print.html": basePrintHtml,
  };
  for (const [original, normalized] of Object.entries(imported.renames)) {
    documents[`/${normalized}`] = await readFile(resolve(input.fixtureRoot, original));
  }
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: input.fontDir }],
    documents,
  );
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let pdfBytes: Uint8Array;
  let browserProduct: string;
  let tocPages: ReadonlyMap<string, number> = new Map();
  try {
    const session = await (input.createBrowser === undefined
      ? launchBrowser(input.browserPath, { signal: cancellation?.signal })
      : input.createBrowser());
    browser = session;
    browserProduct = await session.productVersion();
    if (tocEntries.length === 0) {
      await session.navigate(`${server.origin}/print.html`);
      pdfBytes = await session.printToPdf({ ...printParams });
    } else {
      // 第一遍：页码占位为空，测量各条目锚定章节的实测物理页码。
      await session.navigate(`${server.origin}/print.html`);
      pdfBytes = await session.printToPdf({ ...printParams });
      tocPages = measureTocPageNumbers(pdfBytes, tocEntries);
      tocPages = await resolveStableTocPages(tocPages, async (pages) => {
        documents["/print.html"] = fillTocPageNumbers(basePrintHtml, tocEntries, pages);
        await session.navigate(`${server.origin}/print.html`);
        const candidate = await session.printToPdf({ ...printParams });
        const remeasured = measureTocPageNumbers(candidate, tocEntries);
        pdfBytes = candidate;
        return remeasured;
      });
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
    await browser?.close();
    await server.close();
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

  // 文本层修复（洞/错标）→ 页眉页脚压印 → 终稿逐项自核验。
  const repair = repairPdfTextLayer(pdfBytes, expected.text, expected.repeatables);
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
    }),
    extractedText: strippedText,
    expectedText: expected.text,
    repeatables: expected.repeatables,
    tocPages,
    repair: Object.freeze({
      repairedHoles: repair.repairedHoles,
      patchedObjects: repair.patchedObjects,
    }),
  });
}
