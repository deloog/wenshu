import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";

import {
  extractGeometry,
  fillTocPageNumbers,
  inspectPdf,
  normalizePdfText,
  PdfExportError,
  resolveStampReps,
  stampRunningHeaders,
  stripStampsForReconcile,
  type StampSpec,
} from "../src/index.ts";

/**
 * 页眉页脚压印单元测试（PA-11A）：手工构造最小 Type3 PDF（同 geometry 单测
 * 口径），断言字形复刻、封面豁免、剥离对账回环、交叠/缺字 fail-closed、
 * ActualText 复刻通道与目录页码占位填充守卫。
 */

function streamObject(data: string): string {
  const compressed = deflateSync(Buffer.from(data, "latin1"));
  return `<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${compressed.toString("latin1")}\nendstream`;
}

function buildPdf(objects: readonly string[]): Uint8Array {
  const body = objects
    .map((object, index) => `${index + 1} 0 obj\n${object}\nendobj`)
    .join("\n");
  return new Uint8Array(
    Buffer.from(
      `%PDF-1.7\n${body}\ntrailer\n<</Size ${objects.length + 1} /Root 1 0 R>>\nstartxref\n0\n%%EOF\n`,
      "latin1",
    ),
  );
}

function utf16beHex(text: string): string {
  return Buffer.from(text, "utf16le").swap16().toString("hex").toUpperCase();
}

// Type3 字体（对象 3..6）：01→长 02→文 03..0C→0-9 0D→/ 0E→空格。
const TO_UNICODE = [
  "/CIDInit /ProcSet findresource begin",
  "12 dict begin",
  "begincmap",
  "1 begincodespacerange",
  "<01> <FF>",
  "endcodespacerange",
  "14 beginbfchar",
  "<01> <957F>",
  "<02> <6587>",
  ...[..."0123456789"].map(
    (digit, index) =>
      `<${(index + 3).toString(16).toUpperCase().padStart(2, "0")}> <${digit.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}>`,
  ),
  "<0D> <002F>",
  "<0E> <0020>",
  "endbfchar",
  "endcmap",
  "CMapName currentdict /CMap defineresource pop",
  "end",
].join("\n");
const FONT_OBJECT =
  "<</Type /Font /Subtype /Type3 /FontMatrix [.001 0 0 -.001 0 0] /FirstChar 1" +
  " /LastChar 14 /FontBBox [0 -200 1000 800] /Widths [" +
  `${new Array(14).fill(500).join(" ")}]` +
  " /ToUnicode 4 0 R /FontDescriptor 5 0 R /CharProcs <</g1 6 0 R>> >>";
const DESCRIPTOR_OBJECT =
  "<</Type /FontDescriptor /FontName /AAAAAA+TestSans /FontFamily (Test Sans)>>";

const SPEC: StampSpec = Object.freeze({
  headerText: "长文",
  pageWidthPt: 595,
  pageHeightPt: 842,
  marginTopPt: 56,
  marginBottomPt: 56,
  marginLeftPt: 51,
});

function fixture(pageTwoContent: string): Uint8Array {
  return buildPdf([
    "<</Type/Catalog>>",
    "<</Type/Page /MediaBox [0 0 595 842] /Contents 7 0 R /Resources <</Font <</F1 3 0 R>> >> >>",
    FONT_OBJECT,
    streamObject(TO_UNICODE),
    DESCRIPTOR_OBJECT,
    streamObject("500 0 0 0 500 700 d1"),
    streamObject("BT /F1 10 Tf 1 0 0 1 50 700 Tm <01> Tj ET"),
    `<</Type/Page /MediaBox [0 0 595 842] /Contents 9 0 R /Resources <</Font <</F1 3 0 R>> >> >>`,
    streamObject(pageTwoContent),
  ]);
}

test("stamped header/footer round-trips through strip reconcile; cover exempt", () => {
  const original = fixture("BT /F1 10 Tf 1 0 0 1 50 400 Tm <02> Tj ET");
  const before = inspectPdf(original);
  const stamped = stampRunningHeaders(original, SPEC);
  const after = inspectPdf(stamped);
  assert.equal(after.holes.length, 0);
  // 压印串在提取尾（归一口径）。
  expect(normalizePdfText(after.pages[1]?.text ?? "")).toEndWith("长文2/2");
  // 封面豁免。
  assert.equal(after.pages[0]?.text, before.pages[0]?.text);
  // 位置锚定剥离后与原件逐字一致。
  const stripped = stripStampsForReconcile(
    after.pages.map((page) => page.text),
    SPEC,
  );
  assert.equal(stripped, before.pages.map((page) => page.text).join(""));
  // 终稿几何可解析（Tf 先于 Tm），压印 run 在页边距带内。
  const geometry = extractGeometry(stamped);
  const stampRuns = geometry.textRuns.filter(
    (run) => run.pageIndex === 1 && Math.abs(run.fontSize - 9) < 0.01,
  );
  assert.equal(stampRuns.length, 2);
  assert.ok(stampRuns.every((run) => run.baselineY > 786 || run.baselineY < 56));
});

test("multi-tag font registration keeps original text extraction intact", () => {
  const stamped = stampRunningHeaders(
    fixture("BT /F1 10 Tf 1 0 0 1 50 400 Tm <02> Tj ET"),
    SPEC,
  );
  const after = inspectPdf(stamped);
  assert.ok(after.pages[1]?.text.startsWith("文"), "original F1 text must survive");
  assert.equal(after.holes.length, 0);
});

test("ActualText-only character is replicated via the engine origin representation", () => {
  // 缺（U+7F3A）无单字符 ToUnicode 映射，只以 ActualText 单字来源存在。
  const withActualText = fixture(
    `BT /F1 10 Tf 1 0 0 1 50 400 Tm /Span <</ActualText <${utf16beHex("缺")}>>> BDC <01> Tj EMC ET`,
  );
  const reps = resolveStampReps(withActualText, ["缺"]);
  assert.equal(reps.get("缺")?.actualText, "缺");
  const stamped = stampRunningHeaders(
    withActualText,
    Object.freeze({ ...SPEC, headerText: "缺" }),
  );
  const after = inspectPdf(stamped);
  assert.equal(after.holes.length, 0);
  expect(normalizePdfText(after.pages[1]?.text ?? "")).toEndWith("缺2/2");
});

test("stamp band overlapping existing content fails closed", () => {
  const overlapping = fixture("BT /F1 10 Tf 1 0 0 1 50 20 Tm <01> Tj ET");
  assert.throws(
    () => stampRunningHeaders(overlapping, SPEC),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_STAMP_FAILED",
  );
});

test("character without any faithful representation fails closed", () => {
  assert.throws(
    () =>
      stampRunningHeaders(fixture("BT /F1 10 Tf 1 0 0 1 50 400 Tm <01> Tj ET"), {
        ...SPEC,
        headerText: "无",
      }),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_STAMP_FAILED",
  );
});

test("empty header text fails closed", () => {
  assert.throws(
    () =>
      stampRunningHeaders(fixture("BT /F1 10 Tf 1 0 0 1 50 400 Tm <01> Tj ET"), {
        ...SPEC,
        headerText: "",
      }),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_STAMP_FAILED",
  );
});

test("toc page placeholder fill is exact-once guarded", () => {
  const html = '<span class="toc-entry-page" data-toc-target="node_a"></span>';
  const entries = [Object.freeze({ id: "node_a", title: "甲", level: 1 })];
  const filled = fillTocPageNumbers(html, entries, new Map([["node_a", 3]]));
  assert.ok(filled.includes('data-toc-target="node_a">3</span>'));
  assert.throws(() =>
    fillTocPageNumbers(html + html, entries, new Map([["node_a", 3]])),
  );
  assert.throws(() => fillTocPageNumbers(html, entries, new Map()));
});

function expect(actual: string) {
  return {
    toEndWith(suffix: string) {
      assert.ok(actual.endsWith(suffix), `expected tail ${JSON.stringify(suffix)}`);
    },
  };
}
