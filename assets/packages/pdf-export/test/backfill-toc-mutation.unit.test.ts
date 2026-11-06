import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { extractGeometry } from "../src/geometry.ts";
import { normalizePdfText } from "../src/reconcile.ts";

/**
 * 源码变异测试（A-04E-2a / A2A-F1）：backfill-toc 的几何终验门与配对守卫
 * 必须因正确原因变红。机制同 reconcile-mutation.unit.test.ts：真实 src
 * 临时副本 + 单点锚定变异 + 动态导入；锚点缺失/不唯一即 fail-closed。
 * 每例断言同一注入下控制拦截、变异放行（决定性翻转）。
 * 与既有 harness 的差异（书面化）：① backfill-toc.ts 运行时导入
 * @wenshu/document-model，os.tmpdir() 下裸说明符不可解析，临时副本放包内，
 * 用毕即删；② M-B/M-C 的几何漂移故障注入被拷贝的 pdf-patch.ts（回填自身
 * 不产漂移，门是防御性的），两副本带同一故障，唯一差异是被审变异本身。
 * M-A（配对层 scanChar.char !== "8" 单拆）保持存活但良性：与同点 token.text
 * 校验在归一化语义下不可分，更深层 run 映射校验独立拦截（审计 M-A′ 实证）。
 */

const SRC = resolve(import.meta.dirname, "../src");
/** 包内临时目录（见文件头差异①）。 */
const PKG = resolve(import.meta.dirname, "..");

const BACKFILL_FILES = Object.freeze([
  "errors.ts",
  "extract.ts",
  "inspect.ts",
  "pdf-patch.ts",
  "reconcile.ts",
  "geometry.ts",
  "geometry-marks.ts",
  "geometry-text.ts",
  "backfill-toc-shared.ts",
  "backfill-toc-scan.ts",
  "backfill-toc-pages.ts",
  "backfill-toc-geometry.ts",
  "backfill-toc.ts",
]);

async function copySources(): Promise<string> {
  const dir = await mkdtemp(join(PKG, ".backfill-mutation-"));
  await Promise.all(
    BACKFILL_FILES.map((file) => copyFile(join(SRC, file), join(dir, file))),
  );
  return dir;
}

async function applyMutation(
  dir: string,
  file: string,
  anchor: string,
  replacement: string,
): Promise<void> {
  const path = join(dir, file);
  const source = await readFile(path, "utf8");
  assert.ok(
    source.includes(anchor),
    `mutation anchor not found in ${file}; source drifted`,
  );
  assert.equal(
    source.indexOf(anchor),
    source.lastIndexOf(anchor),
    `mutation anchor must be unique in ${file}`,
  );
  await writeFile(path, source.replace(anchor, replacement), "utf8");
}

async function importModule<ModuleShape>(
  dir: string,
  file: string,
): Promise<ModuleShape> {
  return (await import(pathToFileURL(join(dir, file)).href)) as ModuleShape;
}

function hasBackfillFailure(message: RegExp): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error &&
    error.name === "PdfExportError" &&
    (error as { readonly code?: unknown }).code === "PDF_EXPORT_BACKFILL_FAILED" &&
    message.test(error.message);
}

// --- 几何门直接单元用例的最小结构类型（只含被访问字段） ---

interface BboxLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface FigureLike {
  readonly pageIndex: number;
  readonly mcid: number;
  readonly altShort: string | null;
  readonly altLong: string | null;
  readonly bbox: BboxLike;
  readonly paintBBox: BboxLike;
}

interface GeometryLike {
  readonly pages: readonly {
    index: number;
    rotate: number;
    mediaBox: readonly number[];
  }[];
  readonly figures: readonly FigureLike[];
  readonly textRuns: readonly unknown[];
}

interface BackfillGeometryModule {
  readonly assertSameGeometry: (before: GeometryLike, after: GeometryLike) => void;
}

interface TocEntryLike {
  readonly id: string;
  readonly title: string;
  readonly level: number;
}

interface BackfillModule {
  readonly backfillTocPageNumbers: (
    original: Uint8Array,
    entries: readonly TocEntryLike[],
    tocPages: ReadonlyMap<string, number>,
  ) => Uint8Array;
}

function baseGeometry(): GeometryLike {
  return {
    pages: [{ index: 0, rotate: 0, mediaBox: [0, 0, 600, 800] }],
    figures: [
      {
        pageIndex: 0,
        mcid: 7,
        altShort: null,
        altLong: null,
        bbox: { x: 1, y: 2, width: 3, height: 4 },
        paintBBox: { x: 5, y: 6, width: 7, height: 8 },
      },
    ],
    textRuns: [],
  };
}

// --- 夹具（与 backfill-toc.unit.test.ts 同形态的最小 Type3 PDF，精简标签） ---

const CODE: Readonly<Record<string, string>> = {
  "8": "01",
  "5": "02",
  "2": "03",
  "3": "04",
  "7": "0D",
  目: "0B",
  录: "0C",
  A: "41",
  B: "42",
  C: "43",
  D: "44",
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

function textBlock(mcid: number, x: number, y: number, ops: string): string {
  return [
    `/NonStruct <</MCID ${mcid} >>BDC`,
    "BT /F1 10 Tf",
    `1 0 0 -1 ${x} ${y} Tm`,
    ops,
    "ET",
    "EMC",
  ].join("\n");
}

const SLOTS = "<01> Tj\n5 0 Td <01> Tj\n5 0 Td <01> Tj";

/** 目录页内容流：栏目「目录」+ 逐条目（标题块、占位组块，行距 40 内容单位）。 */
function tocContent(titles: readonly string[]): string {
  const parts = [".24 0 0 -.24 0 841.92 cm", textBlock(0, 10, 700, showOps("目录"))];
  let mcid = 1;
  titles.forEach((title, index) => {
    const y = 740 + 40 * index;
    parts.push(textBlock(mcid, 30, y, showOps(title)));
    mcid += 1;
    parts.push(textBlock(mcid, 100, y, SLOTS));
    mcid += 1;
  });
  return parts.join("\n");
}

const COVER = `.24 0 0 -.24 0 841.92 cm\n${textBlock(0, 10, 700, showOps("A"))}`;

function fixturePdf(pageContents: readonly string[]): Uint8Array {
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
    streamObject(TO_UNICODE),
    `<</Type /FontDescriptor /FontName /AAAAAA+TestSans /FontFamily (Test Sans) /FontWeight 400>>`,
    streamObject("0 0 1000 1000 re f"),
  );
  return buildPdf(objects);
}

const entry = (id: string, title: string): TocEntryLike =>
  Object.freeze({ id, title, level: 1 });

function pageText(pdf: Uint8Array, pageIndex: number): string {
  const geometry = extractGeometry(pdf);
  return normalizePdfText(
    geometry.textRuns
      .filter((run) => run.pageIndex === pageIndex)
      .map((run) => run.text)
      .join(""),
  );
}

/** 标准夹具：封面 + 双条目目录页；条目 a→5（收缩）、b→23。 */
function standardFixture(): {
  readonly pdf: Uint8Array;
  readonly entries: readonly TocEntryLike[];
  readonly pages: ReadonlyMap<string, number>;
} {
  return {
    pdf: fixturePdf([COVER, tocContent(["AB", "CD"])]),
    entries: [entry("a", "AB"), entry("b", "CD")],
    pages: new Map([
      ["a", 5],
      ["b", 23],
    ]),
  };
}

// --- ① 几何终验门：页框/figure 扰动必须被拦截，且逐条款承重 ---

test("geometry gate red: mediaBox element drift is caught, clause is load-bearing", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "backfill-toc-geometry.ts",
      "      a.mediaBox.length !== b.mediaBox.length ||\n" +
        "      a.mediaBox.some((value, i) => value !== b.mediaBox[i])",
      "      a.mediaBox.length !== b.mediaBox.length",
    );
    const control = await importModule<BackfillGeometryModule>(
      controlDir,
      "backfill-toc-geometry.ts",
    );
    const mutated = await importModule<BackfillGeometryModule>(
      mutatedDir,
      "backfill-toc-geometry.ts",
    );
    const before = baseGeometry();
    const after: GeometryLike = {
      ...before,
      pages: [{ index: 0, rotate: 0, mediaBox: [0, 0, 601, 800] }],
    };
    // 变异：元素级比较被拆——同一漂移被放行（决定性翻转）。
    assert.throws(
      () => control.assertSameGeometry(before, after),
      hasBackfillFailure(/changed a page box or rotation/u),
    );
    // 变异：元素级比较被拆——同一漂移被放行（决定性翻转）。
    assert.doesNotThrow(() => mutated.assertSameGeometry(before, after));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("geometry gate red: figure paintBBox drift is caught, clause is load-bearing", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "backfill-toc-geometry.ts",
      "      a.paintBBox.y !== b.paintBBox.y ||\n",
      "",
    );
    const control = await importModule<BackfillGeometryModule>(
      controlDir,
      "backfill-toc-geometry.ts",
    );
    const mutated = await importModule<BackfillGeometryModule>(
      mutatedDir,
      "backfill-toc-geometry.ts",
    );
    const before = baseGeometry();
    const after: GeometryLike = {
      ...before,
      figures: before.figures.map((figure) => ({
        ...figure,
        paintBBox: { x: 5, y: 9, width: 7, height: 8 },
      })),
    };
    assert.throws(
      () => control.assertSameGeometry(before, after),
      hasBackfillFailure(/changed a figure span/u),
    );
    assert.doesNotThrow(() => mutated.assertSameGeometry(before, after));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

// --- ② M-B 致命化：注入「增量更新多一页」故障（两副本同一 pdf-patch 故障），
//     唯一差异是变异副本摘掉了 assertSameGeometry 调用 ---

const INJECT_EXTRA_PAGE_ANCHOR = "  const xrefStart = cursor;";
const INJECT_EXTRA_PAGE_FAULT =
  '  const injectedStream = deflateSync(Buffer.from("", "latin1"));\n' +
  '  const injectedChunk = "900 0 obj\\n<</Type /Page /MediaBox [0 0 600 800] /Contents 901 0 R>>\\nendobj\\n" +\n' +
  '    "901 0 obj\\n<</Length " + injectedStream.length + " /Filter /FlateDecode>>\\nstream\\n" +\n' +
  '    injectedStream.toString("latin1") + "\\nendstream\\nendobj\\n";\n' +
  "  parts.push(injectedChunk);\n" +
  '  cursor += Buffer.byteLength(injectedChunk, "latin1");\n' +
  "  const xrefStart = cursor;";

test("wiring red (M-B): page-count corruption is intercepted by assertSameGeometry", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    // 两副本带同一故障源：增量更新出口多写一页。
    for (const dir of [controlDir, mutatedDir]) {
      await applyMutation(
        dir,
        "pdf-patch.ts",
        INJECT_EXTRA_PAGE_ANCHOR,
        INJECT_EXTRA_PAGE_FAULT,
      );
    }
    // 变异副本：几何终验门调用被摘（审计 M-B 形态）。
    await applyMutation(
      mutatedDir,
      "backfill-toc.ts",
      "  assertSameGeometry(before, after);\n",
      "",
    );
    const control = await importModule<BackfillModule>(controlDir, "backfill-toc.ts");
    const mutated = await importModule<BackfillModule>(mutatedDir, "backfill-toc.ts");
    const fixture = standardFixture();
    // 控制：页数被回填改动 → assertSameGeometry 以精确消息拦截。
    assert.throws(
      () => control.backfillTocPageNumbers(fixture.pdf, fixture.entries, fixture.pages),
      hasBackfillFailure(/changed the page count/u),
    );
    // 变异：门被摘后同一故障一路通关产出字节——证明该调用承重。
    assert.ok(
      mutated.backfillTocPageNumbers(fixture.pdf, fixture.entries, fixture.pages)
        .length > fixture.pdf.length,
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

// --- ③ M-C 致命化：注入「未触碰 run 的 bbox.x 漂移」故障（重写流内首部 Tm
//     后追加 9 0 Td），唯一差异是变异副本的 runsEqual 删了 bbox.x 比较 ---

const SHIFT_X_ANCHOR =
  '    const compressed = deflateSync(Buffer.from(streamText, "latin1"));';
const SHIFT_X_FAULT =
  "    const compressed = deflateSync(\n" +
  '      Buffer.from(streamText.replace(" Tm\\n", " Tm\\n9 0 Td\\n"), "latin1"),\n' +
  "    );";

test("final verification red (M-C): bbox.x drift on an untouched run is intercepted", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    for (const dir of [controlDir, mutatedDir]) {
      await applyMutation(dir, "pdf-patch.ts", SHIFT_X_ANCHOR, SHIFT_X_FAULT);
    }
    // 变异副本：runsEqual 的 bbox.x 比较被拆（审计 M-C 形态）。
    await applyMutation(
      mutatedDir,
      "backfill-toc-geometry.ts",
      "    a.bbox.x === b.bbox.x &&\n",
      "",
    );
    const control = await importModule<BackfillModule>(controlDir, "backfill-toc.ts");
    const mutated = await importModule<BackfillModule>(mutatedDir, "backfill-toc.ts");
    const fixture = standardFixture();
    // 控制：栏目「目录」run 的 bbox.x 被故障右移 → 终验以精确消息拦截。
    assert.throws(
      () => control.backfillTocPageNumbers(fixture.pdf, fixture.entries, fixture.pages),
      hasBackfillFailure(/outside the placeholder digits/u),
    );
    // 变异：bbox.x 失明后同一漂移放行——证明该比较承重。
    assert.ok(
      mutated.backfillTocPageNumbers(fixture.pdf, fixture.entries, fixture.pages)
        .length > fixture.pdf.length,
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

// --- ④ M-E 致命化：重名/含 8 标题夹具（a「A8」、b「8」）。变异副本配对游标
//     不回跳 3 槽，把条目 b 错配进条目 a 的占位组——终验①（verifyCursor）必拦 ---

test("pairing cursor red (M-E): weakened cursor mispairs overlapping-8 titles, caught by final verification", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "backfill-toc.ts",
      "        cursor = titleEnd + PLACEHOLDER_SLOTS;",
      "        cursor = titleEnd;",
    );
    const control = await importModule<BackfillModule>(controlDir, "backfill-toc.ts");
    const mutated = await importModule<BackfillModule>(mutatedDir, "backfill-toc.ts");
    const pdf = fixturePdf([COVER, tocContent(["A8", "8"])]);
    const entries = [entry("a", "A8"), entry("b", "8")];
    const pages: ReadonlyMap<string, number> = new Map([
      ["a", 5],
      ["b", 7],
    ]);
    // 控制：游标跳过占位组，条目 b 配到自身占位组——回填成功且逐字正确。
    const result = control.backfillTocPageNumbers(pdf, entries, pages);
    assert.equal(pageText(result, 1), "目录A8587");
    // 变异：游标回退 3 字符，条目 b 标题「8」错配进条目 a 的占位组——
    // 终验①读出未回填/错回填字符，fail-closed。
    assert.throws(
      () => mutated.backfillTocPageNumbers(pdf, entries, pages),
      hasBackfillFailure(/lost a toc entry title|does not match the measured page/u),
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});
