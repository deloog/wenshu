import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  A4_HEIGHT_IN,
  A4_WIDTH_IN,
  assertMetadataPolicy,
  assertPdfReconciled,
  buildExpectedPdfText,
  buildPrintParams,
  composePrintDocument,
  extractSvgText,
  normalizePdfText,
  PdfExportError,
} from "../src/index.ts";
import { mapTemplate, parseApprovedFontSet } from "@wenshu/template-map";

const fixture = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/golden-report.md",
);
const fixtureRoot = resolve(fixture, "..");
const manifestPath = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R/font-manifest.json",
);
const templatePath = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/formal-business.template.json",
);

async function loadModel() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const fontSet = parseApprovedFontSet(manifest);
  assert.ok(fontSet.ok);
  const mapped = mapTemplate(
    JSON.parse(await readFile(templatePath, "utf8")),
    fontSet.value,
  );
  if (!mapped.ok) {
    assert.fail("fixture template must map");
  }
  return mapped.value;
}

test("compose inlines css into the document head without touching structure", () => {
  const html =
    "<!doctype html><html><head><title>t</title></head><body><main>x</main></body></html>";
  const out = composePrintDocument(html, "body { color: #000000; }");
  assert.ok(out.includes("img, svg { max-width: 100%; height: auto; }"));
  assert.ok(out.includes("body { color: #000000; }"));
  assert.ok(out.includes("<main>x</main>"));
  assert.throws(() => composePrintDocument("<p>broken</p>", "x"), PdfExportError);
});

test("print params follow export profile and A4 geometry", async () => {
  const params = buildPrintParams(await loadModel());
  assert.ok(Math.abs(params.paperWidth - A4_WIDTH_IN) < 0.001);
  assert.ok(Math.abs(params.paperHeight - A4_HEIGHT_IN) < 0.001);
  assert.ok(Math.abs(params.paperWidth - 8.2677) < 0.001);
  assert.ok(Math.abs(params.marginTop - 0.7874) < 0.001);
  assert.ok(Math.abs(params.marginRight - 0.7087) < 0.001);
  assert.equal(params.printBackground, true);
  assert.equal(params.preferCSSPageSize, true);
  assert.equal(params.displayHeaderFooter, false);
  assert.equal(params.scale, 1);
});

test("metadata policy accepts engine constants and rejects upstream identity", () => {
  const good = {
    Title: "文档标题",
    Producer: "Skia/PDF m150",
    Creator:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36",
    CreationDate: "D:20260724000000+00'00'",
  };
  assert.doesNotThrow(() => assertMetadataPolicy(good, null, "文档标题"));
  const violations: Array<Record<string, string>> = [
    { ...good, Author: "张三" },
    { ...good, Company: "某公司" },
    { ...good, Keywords: "内部" },
    { ...good, Title: "别的标题" },
    { ...good, Producer: "Microsoft Word" },
    { ...good, Creator: "WPS Office 用户" },
  ];
  for (const bad of violations) {
    assert.throws(
      () => assertMetadataPolicy(bad, null, "文档标题"),
      (error: unknown) =>
        error instanceof PdfExportError && error.code === "PDF_EXPORT_METADATA_POLICY",
      JSON.stringify(bad),
    );
  }
  assert.throws(
    () => assertMetadataPolicy(good, "<xmp>author: someone</xmp>", "文档标题"),
    PdfExportError,
  );
});

test("svg text extraction follows the pdf reading order and unescapes entities", () => {
  const svg =
    '<svg><text x="1" y="2">标题 &amp; 甲</text><text x="1" y="5">乙 &lt;丙&gt;</text></svg>';
  // y 升序（PDF 设备空间阅读序）：y=2 先于 y=5。
  assert.equal(extractSvgText(svg), "标题 & 甲乙 <丙>");
});

test("pdf text normalization maps radicals, ligatures, and fullwidth forms", () => {
  assert.equal(normalizePdfText("⻓⽂ﬀﬁ（）　甲"), "长文fffi()甲");
});

test("reconciliation is exact and reports first diff without content echo", async () => {
  const { importMarkdownDocument } = await import("@wenshu/markdown-import");
  const { TOC_HEADING, collectTocEntries } = await import("@wenshu/document-model");
  const imported = await importMarkdownDocument(fixture, fixtureRoot);
  const svgTexts = await Promise.all(
    Object.keys(imported.renames).map(async (original) =>
      extractSvgText(await readFile(resolve(fixtureRoot, original), "utf8")),
    ),
  );
  // 单元级合成页码（非基线）：只验证期望装配与对账判定，页码真值由两遍渲染管线钉。
  const entries = collectTocEntries(imported.document);
  const expected = buildExpectedPdfText(imported.document, svgTexts, {
    heading: TOC_HEADING,
    entries,
    pages: new Map(entries.map((entry, index) => [entry.id, index + 2])),
  }).text;
  // 自身恒等
  assert.doesNotThrow(() => assertPdfReconciled(expected, expected));
  // 丢一字即失败（只断言稳定 code 与位置提示，不锁定受归一影响的具体索引）。
  const broken = `${expected.slice(0, 100)}${expected.slice(101)}`;
  assert.throws(
    () => assertPdfReconciled(broken, expected),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_RECONCILE_FAILED" &&
      /first diff at \d+/u.test(error.message),
  );
});

test("verify wiring cannot omit the pdf export package", async () => {
  const packagePath = resolve(import.meta.dirname, "../../../package.json");
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  const scripts = (parsed as Record<string, unknown>)["scripts"];
  const contracts = String((scripts as Record<string, unknown>)["contracts:test"]);
  assert.match(contracts, /@wenshu\/pdf-export/u);
});
