import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import {
  launchBrowser,
  parseFontPlan,
  renderDocumentHtml,
  startStaticServer,
  verifyFontFiles,
} from "@wenshu/report-render";
import { renderTemplateCss } from "@wenshu/template-css";
import { mapTemplate, parseApprovedFontSet } from "@wenshu/template-map";

import { composePrintDocument } from "./compose.ts";
import { inspectPdf, type PdfInspection } from "./inspect.ts";
import { buildExpectedPdfText, extractSvgText } from "./reconcile.ts";
import { buildPrintParams, type PrintParams } from "./print-params.ts";
import { injectSvgFontFace } from "./svg-font.ts";

export interface BaselineInput {
  readonly fixture: string;
  readonly fixtureRoot: string;
  readonly fontDir: string;
  readonly templatePath: string;
  readonly browserPath?: string | undefined;
}

export interface BaselineOutput {
  readonly pdfBytes: Uint8Array;
  readonly browserProduct: string;
  readonly printParams: PrintParams;
  readonly inspection: PdfInspection;
  readonly extractedText: string;
  readonly expectedText: string;
}

/**
 * PA-05 基线导出管线：固定 fixture → 语义 HTML → 白名单 CSS → 真实 Chromium printToPDF。
 * 只产出与检查，不写文件；调用方负责留证。
 */
export async function produceBaselinePdf(
  input: BaselineInput,
): Promise<BaselineOutput> {
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
  const printHtml = composePrintDocument(renderDocumentHtml(imported.document), css);
  const printParams = buildPrintParams(model);

  const documents: Record<string, string | Uint8Array> = { "/print.html": printHtml };
  const fontFamily =
    typeof manifest["family"] === "string" ? (manifest["family"] as string) : "";
  for (const [original, normalized] of Object.entries(imported.renames)) {
    const bytes = await readFile(resolve(input.fixtureRoot, original));
    // 供给期变换：SVG 注入 @font-face 使图表文本使用冻结 OTF（冻结资产字节不变）。
    documents[`/${normalized}`] = original.toLowerCase().endsWith(".svg")
      ? injectSvgFontFace(new TextDecoder().decode(bytes), fontFamily, "/fonts/", plan)
      : bytes;
  }
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: input.fontDir }],
    documents,
  );
  const browser = await launchBrowser(input.browserPath);
  let pdfBytes: Uint8Array;
  let browserProduct: string;
  try {
    await browser.navigate(`${server.origin}/print.html`);
    browserProduct = await browser.productVersion();
    pdfBytes = await browser.printToPdf({ ...printParams });
  } finally {
    await browser.close();
    await server.close();
  }

  const svgTexts = await Promise.all(
    Object.keys(imported.renames).map(async (original) =>
      extractSvgText(await readFile(resolve(input.fixtureRoot, original), "utf8")),
    ),
  );
  const inspection = inspectPdf(pdfBytes);
  return Object.freeze({
    pdfBytes,
    browserProduct,
    printParams,
    inspection,
    extractedText: inspection.pages.map((page) => page.text).join(""),
    expectedText: buildExpectedPdfText(imported.document, svgTexts),
  });
}
