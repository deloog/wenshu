import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";

import { extractGeometry, PdfExportError } from "../src/index.ts";

/**
 * 几何提取单元测试：手工构造最小 PDF 字节（parser 只需要 `N 0 obj … endobj`
 * 与 FlateDecode 流），断言逐 run 几何、图形 span 包围盒、阅读序、
 * ActualText 宽度语义与 StructElem 替代文本关联。
 */

function streamObject(data: string): string {
  const compressed = deflateSync(Buffer.from(data, "latin1"));
  return `<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${compressed.toString("latin1")}\nendstream`;
}

function buildPdf(objects: readonly string[]): Uint8Array {
  const body = objects
    .map((object, index) => `${index + 1} 0 obj\n${object}\nendobj`)
    .join("\n");
  return new Uint8Array(Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, "latin1"));
}

function utf16beHex(text: string): string {
  return Buffer.from(text, "utf16le").swap16().toString("hex").toUpperCase();
}

function close(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `expected ${actual} to be within 0.01 of ${expected}`,
  );
}

// 固定 Type3 字体 fixture（对象 3..6）：Widths [500 250 400]，FontMatrix ±.001，
// FontBBox y0=-200（下降）y1=800（上升），映射 01→A 02→B 03→C。
const TO_UNICODE = [
  "/CIDInit /ProcSet findresource begin",
  "12 dict begin",
  "begincmap",
  "1 begincodespacerange",
  "<01> <FF>",
  "endcodespacerange",
  "3 beginbfchar",
  "<01> <0041>",
  "<02> <0042>",
  "<03> <0043>",
  "endbfchar",
  "endcmap",
  "CMapName currentdict /CMap defineresource pop",
  "end",
].join("\n");
const FONT_OBJECT =
  "<</Type /Font /Subtype /Type3 /FontMatrix [.001 0 0 -.001 0 0] /FirstChar 1" +
  " /LastChar 3 /FontBBox [0 -200 1000 800] /Widths [500 250 400]" +
  " /ToUnicode 4 0 R /FontDescriptor 5 0 R /CharProcs <</g1 6 0 R>> >>";
const DESCRIPTOR_OBJECT =
  "<</Type /FontDescriptor /FontName /AAAAAA+TestSans-Bold" +
  " /FontFamily (Test Sans) /FontWeight 700>>";
const PAGE_OBJECT =
  "<</Type /Page /MediaBox [0 0 600 800]" +
  " /Resources <</Font <</F1 3 0 R>> >> /Contents 2 0 R>>";

function fixturePdf(content: string, extraObjects: readonly string[] = []): Uint8Array {
  return buildPdf([
    PAGE_OBJECT,
    streamObject(content),
    FONT_OBJECT,
    streamObject(TO_UNICODE),
    DESCRIPTOR_OBJECT,
    streamObject("0 0 1000 1000 re f"),
    ...extraObjects,
  ]);
}

test("text runs retain hand-computed position, width, and height", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        ".24 0 0 -.24 0 841.92 cm",
        "/NonStruct <</MCID 0 >>BDC",
        "BT",
        "/F1 10 Tf",
        "1 0 0 -1 100 200 Tm",
        "<01> Tj",
        "5 0 Td <02> Tj",
        "ET",
        "EMC",
      ].join("\n"),
    ),
  );
  assert.equal(geometry.pages.length, 1);
  assert.deepEqual([...(geometry.pages[0]?.mediaBox ?? [])], [0, 0, 600, 800]);
  assert.equal(geometry.pages[0]?.rotate, 0);
  assert.equal(geometry.textRuns.length, 2);
  const [first, second] = geometry.textRuns;
  assert.equal(first?.text, "A");
  // CTM×Tm = [.24 0 0 .24 24 793.92]；宽 = 500×.001×10×.24 = 1.2。
  close(first?.bbox.x ?? 0, 24);
  close(first?.baselineY ?? 0, 793.92);
  close(first?.bbox.width ?? 0, 1.2);
  // 上升 = .24×(-.001×-200)×10 = .48；下降 = .24×(-.001×800)×10 = -1.92。
  close(first?.bbox.y ?? 0, 794.4);
  close(first?.bbox.height ?? 0, 2.4);
  assert.equal(first?.fontSize, 10);
  assert.equal(first?.blockOrder, 1);
  assert.equal(first?.viaActualText, false);
  assert.deepEqual(first?.font, {
    objectId: 3,
    tag: "F1",
    family: "Test Sans",
    weight: 700,
    subset: true,
    embedded: true,
  });
  assert.equal(second?.text, "B");
  close(second?.bbox.x ?? 0, 25.2);
  close(second?.baselineY ?? 0, 793.92);
  close(second?.bbox.width ?? 0, 0.6);
});

test("TJ kerning numbers adjust the accumulated run width", () => {
  const geometry = extractGeometry(
    fixturePdf(["/F1 10 Tf", "1 0 0 1 0 0 Tm", "[<01> -120 <02>] TJ"].join("\n")),
  );
  assert.equal(geometry.textRuns.length, 1);
  const run = geometry.textRuns[0];
  assert.equal(run?.text, "AB");
  // 500×.001×10 + 120/1000×10 + 250×.001×10 = 5 + 1.2 + 2.5 = 8.7。
  close(run?.bbox.width ?? 0, 8.7);
});

test("figure span bbox unions path ops under nested cm transforms", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        ".5 0 0 -.5 0 800 cm",
        "/Figure <</MCID 3 >>BDC",
        "q",
        "2 0 0 2 10 20 cm",
        "0 0 100 50 re",
        "f",
        "10 10 m 60 40 l S",
        "20 20 30 30 40 40 c S",
        "h",
        "Q",
        "EMC",
      ].join("\n"),
    ),
  );
  assert.equal(geometry.figures.length, 1);
  const figure = geometry.figures[0];
  assert.equal(figure?.mcid, 3);
  // 合成矩阵 [1 0 0 -1 5 790]（嵌套 cm 平移同样被外层缩放）：x 5..105，y 740..790。
  // bbox.y 为顶边（y 向上空间的 max y）= 790。
  close(figure?.bbox.x ?? 0, 5);
  close(figure?.bbox.y ?? 0, 790);
  close(figure?.bbox.width ?? 0, 100);
  close(figure?.bbox.height ?? 0, 50);
  // 本例路径全部由绘制算子消费：paintBBox 与 bbox 一致。
  close(figure?.paintBBox.x ?? 0, 5);
  close(figure?.paintBBox.y ?? 0, 790);
  close(figure?.paintBBox.width ?? 0, 100);
  close(figure?.paintBBox.height ?? 0, 50);
  // 无 StructElem：提取事实照实输出 null 替代文本。
  assert.equal(figure?.altShort, null);
  assert.equal(figure?.altLong, null);
});

test("clip paths grow figure bbox but never the painted bbox", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        "/Figure <</MCID 2 >>BDC",
        // 版心全域 clip（自家管线 SVG 根背景的真实形态）：只进 bbox。
        "0 0 600 800 re",
        "W* n",
        // 实际绘制内容：一小块填充矩形。
        "100 600 200 100 re",
        "f",
        "EMC",
      ].join("\n"),
    ),
  );
  const figure = geometry.figures[0];
  assert.equal(figure?.mcid, 2);
  close(figure?.bbox.x ?? 0, 0);
  close(figure?.bbox.width ?? 0, 600);
  close(figure?.bbox.height ?? 0, 800);
  close(figure?.paintBBox.x ?? 0, 100);
  close(figure?.paintBBox.y ?? 0, 700);
  close(figure?.paintBBox.width ?? 0, 200);
  close(figure?.paintBBox.height ?? 0, 100);
});

test("figure membership is a parse-time fact, never bbox geometry", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        "/Figure <</MCID 5 >>BDC",
        // clip 撑大 bbox 到整页；绘制内容只有左上角一块。
        "0 0 600 800 re",
        "W* n",
        "0 700 100 100 re",
        "f",
        "BT /F1 10 Tf",
        "1 0 0 1 10 750 Tm <01> Tj",
        "ET",
        "EMC",
        "/NonStruct <</MCID 6 >>BDC",
        "BT /F1 10 Tf",
        // 几何落在 figure bbox 内（整页），但结构上在 span 外 → 非成员。
        "1 0 0 1 300 400 Tm <02> Tj",
        "ET",
        "EMC",
      ].join("\n"),
    ),
  );
  assert.equal(geometry.textRuns.length, 2);
  const member = geometry.textRuns.find((run) => run.text === "A");
  const outsider = geometry.textRuns.find((run) => run.text === "B");
  assert.equal(member?.figureMcid, 5);
  assert.equal(outsider?.figureMcid, null);
});

test("run straddling a figure span boundary is non-member (mixed)", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        "BT /F1 10 Tf",
        // 同一 run：第一个字形在 span 外，第二个在 span 内（无 Tm/Td 切断）。
        "1 0 0 1 0 0 Tm <01> Tj",
        "/Figure <</MCID 4 >>BDC",
        "<02> Tj",
        "EMC",
        "ET",
      ].join("\n"),
    ),
  );
  assert.equal(geometry.textRuns.length, 1);
  assert.equal(geometry.textRuns[0]?.text, "AB");
  assert.equal(geometry.textRuns[0]?.figureMcid, null);
});

test("figure with only clip content registers a zero painted bbox", () => {
  const geometry = extractGeometry(
    fixturePdf(["/Figure <</MCID 9 >>BDC", "0 0 600 800 re", "W* n", "EMC"].join("\n")),
  );
  const figure = geometry.figures[0];
  assert.equal(figure?.mcid, 9);
  assert.ok((figure?.bbox.width ?? 0) > 0);
  assert.deepEqual(figure?.paintBBox, { x: 0, y: 0, width: 0, height: 0 });
});

test("reading order sorts by block order, then y bucket desc, then x asc", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        "/NonStruct <</MCID 0 >>BDC",
        "BT /F1 10 Tf",
        "1 0 0 1 200 300 Tm <02> Tj",
        "1 0 0 1 100 300 Tm <01> Tj",
        "1 0 0 1 0 700 Tm <03> Tj",
        "ET",
        "EMC",
        "/NonStruct <</MCID 1 >>BDC",
        "BT /F1 10 Tf",
        "1 0 0 1 50 50 Tm <01> Tj",
        "ET",
        "EMC",
      ].join("\n"),
    ),
  );
  assert.deepEqual(
    geometry.textRuns.map((run) => run.text),
    ["C", "A", "B", "A"],
  );
  assert.deepEqual(
    geometry.textRuns.map((run) => run.blockOrder),
    [1, 1, 1, 2],
  );
});

test("ActualText runs use span text but width from suppressed glyph advances", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        "/F1 10 Tf",
        `/Span<</ActualText <FEFF${utf16beHex("中")}> >> BDC`,
        "1 0 0 1 0 0 Tm",
        "<01> Tj",
        "5 0 Td <02> Tj",
        "EMC",
        "<03> Tj",
      ].join("\n"),
    ),
  );
  assert.equal(geometry.textRuns.length, 2);
  const [span, after] = geometry.textRuns;
  // 与 extract.ts 一致：span 文本保留 FEFF BOM（归一化是对账层职责）。
  assert.equal(span?.text, "\uFEFF中");
  assert.equal(span?.viaActualText, true);
  close(span?.bbox.width ?? 0, 5);
  // 被抑制的 <02> 仍贡献 2.5 前进量；EMC 后 <03> 文本入同一 run。
  assert.equal(after?.text, "C");
  assert.equal(after?.viaActualText, false);
  close(after?.bbox.width ?? 0, 6.5);
});

test("struct elements associate leaf long alt and parent short alt by page and mcid", () => {
  const geometry = extractGeometry(
    fixturePdf(
      [
        "/Figure <</MCID 7 >>BDC",
        "0 0 100 50 re",
        "f",
        "EMC",
        "/Figure <</MCID 8 >>BDC",
        "0 0 10 10 re",
        "f",
        "EMC",
      ].join("\n"),
      [
        `<</Type /StructElem /S /Figure /Alt <FEFF${utf16beHex("中文")}>` +
          " /P 8 0 R /Pg 1 0 R /K 7>>",
        `<</Type /StructElem /S /Figure /Alt <FEFF${utf16beHex("图")}> /K [7 0 R]>>`,
        `<</Type /StructElem /S /Figure /Alt <FEFF${utf16beHex("孤")}> /Pg 1 0 R /K 99>>`,
      ],
    ),
  );
  assert.equal(geometry.figures.length, 3);
  const [matched, unmatched, orphan] = geometry.figures;
  assert.equal(matched?.mcid, 7);
  assert.equal(matched?.altLong, "中文");
  assert.equal(matched?.altShort, "图");
  close(matched?.bbox.width ?? 0, 100);
  close(matched?.bbox.height ?? 0, 50);
  assert.equal(unmatched?.mcid, 8);
  assert.equal(unmatched?.altLong, null);
  assert.equal(unmatched?.altShort, null);
  // 结构树叶子无对应 span：零包围盒登记，替代文本仍保留。
  assert.equal(orphan?.mcid, 99);
  assert.equal(orphan?.altLong, "孤");
  assert.equal(orphan?.altShort, null);
  assert.deepEqual(orphan?.bbox, { x: 0, y: 0, width: 0, height: 0 });
});

test("fail-closed on pages without MediaBox and fonts without Type3 geometry", () => {
  assert.throws(
    () =>
      extractGeometry(
        buildPdf([
          "<</Type /Page /Resources <</Font <</F1 3 0 R>> >> /Contents 2 0 R>>",
          streamObject("/F1 10 Tf 1 0 0 1 0 0 Tm <01> Tj"),
          FONT_OBJECT,
          streamObject(TO_UNICODE),
          DESCRIPTOR_OBJECT,
          streamObject("0 0 1 1 re f"),
        ]),
      ),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_INSPECT_UNSUPPORTED",
  );
  assert.throws(
    () =>
      extractGeometry(
        buildPdf([
          PAGE_OBJECT,
          streamObject("/F1 10 Tf 1 0 0 1 0 0 Tm <01> Tj"),
          "<</Type /Font /Subtype /Type3 /FirstChar 1 /LastChar 1>>",
          streamObject(TO_UNICODE),
          DESCRIPTOR_OBJECT,
          streamObject("0 0 1 1 re f"),
        ]),
      ),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_INSPECT_UNSUPPORTED",
  );
});
