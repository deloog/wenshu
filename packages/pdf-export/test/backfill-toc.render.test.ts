import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { collectTocEntries, type TocEntry } from "@wenshu/document-model";
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

import { backfillTocPageNumbers } from "../src/backfill-toc.ts";
import { composePrintDocument, fillTocPageNumbers } from "../src/compose.ts";
import { PdfExportError } from "../src/errors.ts";
import { extractGeometry } from "../src/geometry.ts";
import { measureTocPageNumbers } from "../src/pagination.ts";
import { buildPrintParams } from "../src/print-params.ts";
import { normalizePdfText } from "../src/reconcile.ts";

/**
 * 目录页码字节级回填渲染测试（决策 #21，真实 Chromium，无 mock）：
 * 真管线渲染 888 占位版 PDF（composePrintDocument + fillTocPageNumbers 假 map，
 * 调用链与 scripts/a04e2a-placeholder-probe.ts 一致），once-render 多用例共享，
 * 断言正常回填、位数收缩、配对守卫、干扰 immunity 与增量更新前缀不变。
 */

const repoRoot = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(repoRoot, "docs/poc-a/fixtures");
const fontDir = resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R");

interface Rendered {
  readonly pdf: Uint8Array;
  readonly entries: readonly TocEntry[];
  readonly measured: ReadonlyMap<string, number>;
}

async function renderPlaceholderPdf(): Promise<Rendered> {
  const imported = await importMarkdownDocument(
    resolve(fixtureRoot, "golden-report.md"),
    fixtureRoot,
  );
  const manifest = JSON.parse(await readFile(resolve(fontDir, "font-manifest.json"), "utf8"));
  const plan = parseFontPlan(manifest);
  await verifyFontFiles(fontDir, plan);
  const fontSet = parseApprovedFontSet(manifest);
  if (!fontSet.ok) throw new Error("font manifest must parse");
  const mapped = mapTemplate(
    JSON.parse(await readFile(resolve(fixtureRoot, "formal-business.template.json"), "utf8")),
    fontSet.value,
  );
  if (!mapped.ok) throw new Error(`template must map: ${JSON.stringify(mapped.issues)}`);
  const css = renderTemplateCss(
    mapped.value,
    plan.map((face) => ({ weight: face.weight, src: `fonts/${face.fileName}` })),
  );
  const svgCache = new Map<string, string>();
  for (const original of Object.keys(imported.renames)) {
    if (original.toLowerCase().endsWith(".svg")) {
      svgCache.set(
        original,
        new TextDecoder().decode(await readFile(resolve(fixtureRoot, original))),
      );
    }
  }
  const basePrintHtml = composePrintDocument(
    renderDocumentHtml(imported.document),
    css,
    (assetPath) => {
      const original = Object.entries(imported.renames).find(
        ([, name]) => name === assetPath,
      )?.[0];
      return original === undefined ? undefined : svgCache.get(original);
    },
  );
  const printParams = buildPrintParams(mapped.value);
  const entries = collectTocEntries(imported.document);
  if (entries.length === 0) throw new Error("fixture must have toc entries");
  // 占位回填：全部条目填 888（只渲染这一遍）。
  const placeholderPages = new Map(entries.map((entry) => [entry.id, 888]));
  const filledHtml = fillTocPageNumbers(basePrintHtml, entries, placeholderPages);

  const documents: Record<string, string | Uint8Array> = { "/print.html": filledHtml };
  for (const [original, normalized] of Object.entries(imported.renames)) {
    documents[`/${normalized}`] = await readFile(resolve(fixtureRoot, original));
  }
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: fontDir }],
    documents,
  );
  const session = await launchBrowser(undefined, {});
  let pdf: Uint8Array;
  try {
    await session.navigate(`${server.origin}/print.html`);
    pdf = await session.printToPdf({ ...printParams });
  } finally {
    await session.close();
    await server.close();
  }
  return Object.freeze({ pdf, entries, measured: measureTocPageNumbers(pdf, entries) });
}

const rendered = await renderPlaceholderPdf();

function pageText(pdf: Uint8Array, pageIndex: number): string {
  const geometry = extractGeometry(pdf);
  return normalizePdfText(
    geometry.textRuns
      .filter((run) => run.pageIndex === pageIndex)
      .map((run) => run.text)
      .join(""),
  );
}

/** 目录页物理页序（本次夹具实测为 page index 3；由内容断言而非硬编码依赖）。 */
function tocPageIndex(pdf: Uint8Array): number {
  const geometry = extractGeometry(pdf);
  const index = geometry.pages.findIndex((page) =>
    pageText(pdf, page.index).startsWith("目录"),
  );
  assert.ok(index !== -1, "toc heading page must exist");
  return index;
}

test("backfill: measured page numbers replace all 888 placeholders end-to-end", () => {
  const { pdf, entries, measured } = rendered;
  const tocIndex = tocPageIndex(pdf);
  assert.ok(pageText(pdf, tocIndex).includes("888"), "placeholder render must carry 888");
  const result = backfillTocPageNumbers(pdf, entries, measured);
  // 增量更新前缀不变。
  assert.ok(
    Buffer.from(result).subarray(0, pdf.length).equals(Buffer.from(pdf)),
    "original byte prefix must be intact",
  );
  const tocText = pageText(result, tocIndex);
  assert.ok(!tocText.includes("888"), "no placeholder triple may survive backfill");
  for (const entry of entries) {
    const page = measured.get(entry.id);
    assert.ok(page !== undefined);
    assert.ok(
      tocText.includes(normalizePdfText(entry.title) + String(page)),
      `toc entry must be followed by its measured page`,
    );
  }
});

test("backfill: hand-written 1/2/3-digit pages shrink surplus slots to empty shells", () => {
  const { pdf, entries } = rendered;
  const tocIndex = tocPageIndex(pdf);
  const digits = [5, 23, 123, 8, 13, 21, 7, 11, 4, 9];
  const fake = new Map(entries.map((entry, index) => [entry.id, digits[index % 10] ?? 5]));
  const result = backfillTocPageNumbers(pdf, entries, fake);
  const tocText = pageText(result, tocIndex);
  for (const [index, entry] of entries.entries()) {
    const page = digits[index % 10] ?? 5;
    assert.ok(tocText.includes(normalizePdfText(entry.title) + String(page)));
  }
  // 一位/两位页码的收缩不留下多余 8（123 三位全替换，亦无 888 三连残留）。
  assert.ok(!tocText.includes("888"));
});

test("fail-closed: a corrupted entry title breaks the pairing guard", () => {
  const { pdf, entries, measured } = rendered;
  const corrupted = entries.map((entry, index) =>
    index === 0 ? Object.freeze({ ...entry, title: `${entry.title}X` }) : entry,
  );
  assert.throws(
    () => backfillTocPageNumbers(pdf, corrupted, measured),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_BACKFILL_FAILED",
  );
});

test("fail-closed: a toc entry without a measured page number", () => {
  const { pdf, entries, measured } = rendered;
  const incomplete = new Map(measured);
  const first = entries[0];
  assert.ok(first !== undefined);
  incomplete.delete(first.id);
  assert.throws(
    () => backfillTocPageNumbers(pdf, entries, incomplete),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_BACKFILL_FAILED",
  );
});

test("immunity: every non-toc page is byte-identical at extraction level (distraction 8s untouched)", () => {
  const { pdf, entries, measured } = rendered;
  const tocIndex = tocPageIndex(pdf);
  const geometry = extractGeometry(pdf);
  const result = backfillTocPageNumbers(pdf, entries, measured);
  for (const page of geometry.pages) {
    if (page.index === tocIndex) {
      continue;
    }
    assert.equal(
      pageText(result, page.index),
      pageText(pdf, page.index),
      `page ${page.index} must be untouched`,
    );
  }
  // 正文含 8 密集页（表格/百分比），回填后原样保留。
  const digitDense = geometry.pages
    .filter((page) => page.index !== tocIndex)
    .map((page) => pageText(pdf, page.index))
    .some((text) => text.includes("8"));
  assert.ok(digitDense, "fixture must carry digit-dense body pages");
});
