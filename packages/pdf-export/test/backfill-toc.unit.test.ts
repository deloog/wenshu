import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";

import type { TocEntry } from "@wenshu/document-model";

import { backfillTocPageNumbers } from "../src/backfill-toc.ts";
import { PdfExportError } from "../src/errors.ts";
import { extractGeometry } from "../src/geometry.ts";
import { normalizePdfText } from "../src/reconcile.ts";

/**
 * 目录页码字节级回填单元测试（决策 #21）：手工构造最小 Type3 PDF
 * （parser 只需要 `N 0 obj … endobj` 与 FlateDecode 流；增量更新需要
 * trailer + startxref），断言正常回填、位数收缩、续页游标、干扰 immunity
 * 与全部 fail-closed 面（配对失配/占位腐化/反查歧义/字缺码/未知算子）。
 */

// 字符 → 单字节码（Type3 字体 codeLength=1）。标题首字走字面串 Tj、
// 其余走十六进制 Tj——两种形态都在真实管线内容流中出现。
const CODE: Readonly<Record<string, string>> = {
  "8": "01", "5": "02", "2": "03", "3": "04", "1": "05", "7": "0D",
  "目": "0B", "录": "0C", ".": "2E",
  A: "41", B: "42", C: "43", D: "44",
};

const TO_UNICODE = [
  "/CIDInit /ProcSet findresource begin",
  "12 dict begin",
  "begincmap",
  "1 begincodespacerange",
  "<01> <FF>",
  "endcodespacerange",
  `${Object.keys(CODE).length} beginbfchar`,
  ...Object.entries(CODE).map(
    ([char, code]) =>
      `<${code}> <${Buffer.from(char, "utf16le").swap16().toString("hex").toUpperCase()}>`,
  ),
  "endbfchar",
  "endcmap",
  "CMapName currentdict /CMap defineresource pop",
  "end",
].join("\n");

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

/** 逐字符 show 算子序列：`<hex> Tj` + `Td` 递进（真实管线形态）。
 * 注意：字面串 Tj 签署提取路径（extract.ts）不认识，不能放进夹具。 */
function showOps(text: string): string {
  return [...text]
    .map((char, index) => {
      const code = CODE[char];
      if (code === undefined) {
        throw new Error(`fixture char has no code: ${char}`);
      }
      return index === 0 ? `<${code}> Tj` : `5 0 Td <${code}> Tj`;
    })
    .join("\n");
}

function textBlock(mcid: number, tag: "NonStruct" | "Lbl", x: number, y: number, ops: string): string {
  return [
    `/${tag} <</MCID ${mcid} >>BDC`,
    "BT /F1 10 Tf",
    `1 0 0 -1 ${x} ${y} Tm`,
    ops,
    "ET",
    "EMC",
  ].join("\n");
}

interface FixtureEntry {
  readonly label: string;
  readonly title: string;
  /** 占位组内容（默认三个 `<01> Tj` 即 888；可注入腐化形态）。 */
  readonly placeholderOps?: string;
}

/** 目录页内容流：栏目「目录」（可选）+ 逐条目标签/标题/占位组（内容 y 递增 = 页面向下）。 */
function tocContent(
  entries: readonly FixtureEntry[],
  options: { readonly heading?: boolean; readonly startY?: number } = {},
): string {
  const headingY = options.startY ?? 700;
  const parts = [".24 0 0 -.24 0 841.92 cm"];
  let mcid = 0;
  if (options.heading ?? true) {
    parts.push(textBlock(mcid, "NonStruct", 10, headingY, showOps("目录")));
    mcid += 1;
  }
  entries.forEach((entry, index) => {
    // 行距 40 内容单位（= 9.6pt 用户空间 > 提取 y 桶 8），保阅读序按行分离。
    const y = headingY + 40 * (index + 1);
    parts.push(textBlock(mcid, "Lbl", 10, y, showOps(entry.label)));
    mcid += 1;
    parts.push(textBlock(mcid, "NonStruct", 30, y, showOps(entry.title)));
    mcid += 1;
    parts.push(
      textBlock(
        mcid,
        "NonStruct",
        100,
        y,
        entry.placeholderOps ?? "<01> Tj\n5 0 Td <01> Tj\n5 0 Td <01> Tj",
      ),
    );
    mcid += 1;
  });
  return parts.join("\n");
}

/** 页对象 + 内容流对象 + 固定字体四件套（对象号按页数推导）。 */
function fixturePdf(pageContents: readonly string[], toUnicode = TO_UNICODE): Uint8Array {
  const objects: string[] = [];
  const fontId = pageContents.length * 2 + 1;
  pageContents.forEach((content, index) => {
    objects.push(
      `<</Type /Page /MediaBox [0 0 600 800]` +
        ` /Resources <</Font <</F1 ${fontId} 0 R>> >> /Contents ${index * 2 + 2} 0 R>>`,
    );
    objects.push(streamObject(content));
  });
  objects.push(
    `<</Type /Font /Subtype /Type3 /FontMatrix [.001 0 0 -.001 0 0] /FirstChar 1` +
      ` /LastChar 68 /FontBBox [0 -200 1000 800]` +
      ` /Widths [${Array.from({ length: 68 }, () => "500").join(" ")}]` +
      ` /ToUnicode ${fontId + 1} 0 R /FontDescriptor ${fontId + 2} 0 R` +
      ` /CharProcs <</g1 ${fontId + 3} 0 R>> >>`,
    streamObject(toUnicode),
    `<</Type /FontDescriptor /FontName /AAAAAA+TestSans /FontFamily (Test Sans) /FontWeight 400>>`,
    streamObject("0 0 1000 1000 re f"),
  );
  return buildPdf(objects);
}

const COVER = textBlock(0, "NonStruct", 10, 700, showOps("A"));
const BODY_DISTRACTION = [
  ".24 0 0 -.24 0 841.92 cm",
  textBlock(0, "NonStruct", 10, 700, "<01> Tj\n5 0 Td <01> Tj\n5 0 Td <01> Tj"),
  textBlock(1, "NonStruct", 10, 720, showOps("CD")),
].join("\n");

const entry = (id: string, title: string): TocEntry => Object.freeze({ id, title, level: 1 });

function pageText(pdf: Uint8Array, pageIndex: number): string {
  const geometry = extractGeometry(pdf);
  return normalizePdfText(
    geometry.textRuns
      .filter((run) => run.pageIndex === pageIndex)
      .map((run) => run.text)
      .join(""),
  );
}

function hasBackfillCode(error: unknown): boolean {
  return error instanceof PdfExportError && error.code === "PDF_EXPORT_BACKFILL_FAILED";
}

const TWO_ENTRIES: readonly FixtureEntry[] = [
  { label: "1.", title: "AB" },
  { label: "2.", title: "CD" },
];

test("backfill: measured-style pages replace placeholders, single-digit shrinks to an empty shell", () => {
  const pdf = fixturePdf([COVER, tocContent(TWO_ENTRIES), BODY_DISTRACTION]);
  const entries = [entry("a", "AB"), entry("b", "CD")];
  const result = backfillTocPageNumbers(
    pdf,
    entries,
    new Map([
      ["a", 5],
      ["b", 23],
    ]),
  );
  // 增量更新前缀不变。
  assert.ok(
    Buffer.from(result).subarray(0, pdf.length).equals(Buffer.from(pdf)),
    "original byte prefix must be intact",
  );
  assert.ok(result.length > pdf.length, "incremental update must append bytes");
  // 目录页：标题后为实测页码；一位页码收缩后无多余 8。
  assert.equal(pageText(result, 1), "目录1.AB52.CD23");
  // 干扰 immunity：正文页天然 888 组原位未动。
  assert.equal(pageText(result, 2), pageText(pdf, 2));
  assert.ok(pageText(result, 2).includes("888"));
  // 提取 run 数：收缩删除 2+1 个数字 run，其余不变（几何全等门已在内部执行）。
  const before = extractGeometry(pdf).textRuns.length;
  const after = extractGeometry(result).textRuns.length;
  assert.equal(before - after, 3);
});

test("backfill: three-digit page numbers replace all three slots in place", () => {
  const pdf = fixturePdf([COVER, tocContent(TWO_ENTRIES), BODY_DISTRACTION]);
  const entries = [entry("a", "AB"), entry("b", "CD")];
  const result = backfillTocPageNumbers(
    pdf,
    entries,
    new Map([
      ["a", 137],
      ["b", 2],
    ]),
  );
  assert.equal(pageText(result, 1), "目录1.AB1372.CD2");
  const before = extractGeometry(pdf).textRuns.length;
  const after = extractGeometry(result).textRuns.length;
  assert.equal(before - after, 2, "only entry b shrinks by two slots");
});

test("backfill: entries continue across toc pages (document order cursor)", () => {
  const pdf = fixturePdf([
    COVER,
    tocContent([{ label: "1.", title: "AB" }]),
    // 续页无栏目，直接承接下一条目。
    tocContent([{ label: "2.", title: "CD" }], { heading: false, startY: 700 }),
  ]);
  const entries = [entry("a", "AB"), entry("b", "CD")];
  const result = backfillTocPageNumbers(
    pdf,
    entries,
    new Map([
      ["a", 5],
      ["b", 23],
    ]),
  );
  assert.equal(pageText(result, 1), "目录1.AB5");
  assert.equal(pageText(result, 2), "2.CD23");
});

test("backfill: title containing the digit 8 pairs against its own trailing 8", () => {
  const pdf = fixturePdf([COVER, tocContent([{ label: "1.", title: "A8" }]), BODY_DISTRACTION]);
  const result = backfillTocPageNumbers(pdf, [entry("a", "A8")], new Map([["a", 5]]));
  assert.equal(pageText(result, 1), "目录1.A85");
});

test("fail-closed: corrupted entry title breaks the pairing cursor", () => {
  const pdf = fixturePdf([COVER, tocContent(TWO_ENTRIES), BODY_DISTRACTION]);
  assert.throws(
    () =>
      backfillTocPageNumbers(
        pdf,
        [entry("a", "AC"), entry("b", "CD")],
        new Map([
          ["a", 5],
          ["b", 23],
        ]),
      ),
    hasBackfillCode,
  );
});

test("fail-closed: a genuine non-placeholder digit triple after a title is rejected", () => {
  // 守卫语义钉死：标题后三个数字若非占位 888（如真实内容 123），配对必须
  // fail-closed——弱化「必须是 8」检查会把真实内容静默改写为页码。
  const pdf = fixturePdf([
    COVER,
    tocContent([
      { label: "1.", title: "AB", placeholderOps: "<05> Tj\n5 0 Td <03> Tj\n5 0 Td <04> Tj" },
      { label: "2.", title: "CD" },
    ]),
    BODY_DISTRACTION,
  ]);
  assert.throws(
    () =>
      backfillTocPageNumbers(
        pdf,
        [entry("a", "AB"), entry("b", "CD")],
        new Map([
          ["a", 5],
          ["b", 23],
        ]),
      ),
    hasBackfillCode,
  );
});

test("fail-closed: a missing measured page number is rejected upfront", () => {
  const pdf = fixturePdf([COVER, tocContent(TWO_ENTRIES), BODY_DISTRACTION]);
  assert.throws(
    () => backfillTocPageNumbers(pdf, [entry("a", "AB"), entry("b", "CD")], new Map([["a", 5]])),
    hasBackfillCode,
  );
});

test("fail-closed: a two-digit placeholder group (88) is not a valid triple", () => {
  const pdf = fixturePdf([
    COVER,
    tocContent([
      { label: "1.", title: "AB", placeholderOps: "<01> Tj\n5 0 Td <01> Tj" },
      { label: "2.", title: "CD" },
    ]),
    BODY_DISTRACTION,
  ]);
  assert.throws(
    () =>
      backfillTocPageNumbers(
        pdf,
        [entry("a", "AB"), entry("b", "CD")],
        new Map([
          ["a", 5],
          ["b", 23],
        ]),
      ),
    hasBackfillCode,
  );
});

test("fail-closed: a multi-char TJ placeholder is not three single-char shows", () => {
  const pdf = fixturePdf([
    COVER,
    tocContent([
      { label: "1.", title: "AB", placeholderOps: "[<01> <01> <01>] TJ" },
      { label: "2.", title: "CD" },
    ]),
    BODY_DISTRACTION,
  ]);
  assert.throws(
    () =>
      backfillTocPageNumbers(
        pdf,
        [entry("a", "AB"), entry("b", "CD")],
        new Map([
          ["a", 5],
          ["b", 23],
        ]),
      ),
    hasBackfillCode,
  );
});

test("fail-closed: ambiguous reverse lookup (two codes for one digit)", () => {
  const ambiguous = TO_UNICODE.replace(
    "endbfchar",
    "<0E> <0035>\nendbfchar",
  ).replace(`${Object.keys(CODE).length} beginbfchar`, `${Object.keys(CODE).length + 1} beginbfchar`);
  const pdf = fixturePdf([COVER, tocContent(TWO_ENTRIES), BODY_DISTRACTION], ambiguous);
  assert.throws(
    () =>
      backfillTocPageNumbers(
        pdf,
        [entry("a", "AB"), entry("b", "CD")],
        new Map([
          ["a", 5],
          ["b", 23],
        ]),
      ),
    hasBackfillCode,
  );
});

test("fail-closed: a digit without a glyph code in the placeholder font", () => {
  const pdf = fixturePdf([COVER, tocContent(TWO_ENTRIES), BODY_DISTRACTION]);
  assert.throws(
    () =>
      backfillTocPageNumbers(
        pdf,
        [entry("a", "AB"), entry("b", "CD")],
        new Map([
          ["a", 9],
          ["b", 23],
        ]),
      ),
    hasBackfillCode,
  );
});

test("fail-closed: unknown content operator on a toc page", () => {
  const content = `.24 0 0 -.24 0 841.92 cm\n99 88 frob\n${tocContent(TWO_ENTRIES).slice(".24 0 0 -.24 0 841.92 cm\n".length)}`;
  const pdf = fixturePdf([COVER, content, BODY_DISTRACTION]);
  assert.throws(
    () =>
      backfillTocPageNumbers(
        pdf,
        [entry("a", "AB"), entry("b", "CD")],
        new Map([
          ["a", 5],
          ["b", 23],
        ]),
      ),
    hasBackfillCode,
  );
});

test("fail-closed: empty entry list", () => {
  const pdf = fixturePdf([COVER, tocContent(TWO_ENTRIES), BODY_DISTRACTION]);
  assert.throws(() => backfillTocPageNumbers(pdf, [], new Map()), hasBackfillCode);
});
