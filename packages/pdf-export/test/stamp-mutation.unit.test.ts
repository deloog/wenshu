import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { deflateSync } from "node:zlib";

/**
 * 源码变异测试（PA-11A）：页眉页脚压印与多 tag 字体登记各防线必须因正确
 * 原因变红——压印带零交叠自检、封面豁免、Tf 先于 Tm 的流序、同字体多 tag
 * 登记、剥离核验后缀锚定。机制同 repair-mutation.unit.test.ts：真实 src
 * 临时副本 + 单点锚定变异 + 动态导入；锚点缺失/不唯一即 fail-closed。
 * 合成 Type3 PDF 夹具与 stamp.unit.test.ts 同口径。
 */

const SRC = resolve(import.meta.dirname, "../src");

const STAMP_FILES = Object.freeze([
  "errors.ts",
  "extract.ts",
  "geometry.ts",
  "geometry-text.ts",
  "geometry-marks.ts",
  "inspect.ts",
  "reconcile.ts",
  "stamp.ts",
  "stamp-glyphs.ts",
  "stamp-update.ts",
]);

async function copySources(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-export-stamp-mutation-"));
  await Promise.all(
    STAMP_FILES.map((file) => copyFile(join(SRC, file), join(dir, file))),
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

interface GeometryRun {
  readonly pageIndex: number;
  readonly fontSize: number;
  readonly baselineY: number;
}

interface StampModule {
  readonly stampRunningHeaders: (bytes: Uint8Array, spec: StampSpecLike) => Uint8Array;
  readonly stripStampsForReconcile: (
    pageTexts: readonly string[],
    spec: StampSpecLike,
  ) => string;
}

interface InspectModule {
  readonly inspectPdf: (bytes: Uint8Array) => {
    readonly holes: readonly unknown[];
    readonly pages: readonly { readonly text: string }[];
  };
}

interface GeometryModule {
  readonly extractGeometry: (bytes: Uint8Array) => {
    readonly textRuns: readonly GeometryRun[];
  };
}

interface StampSpecLike {
  readonly headerText: string;
  readonly pageWidthPt: number;
  readonly pageHeightPt: number;
  readonly marginTopPt: number;
  readonly marginBottomPt: number;
  readonly marginLeftPt: number;
}

async function importModule<ModuleShape>(
  dir: string,
  file: string,
): Promise<ModuleShape> {
  return (await import(pathToFileURL(join(dir, file)).href)) as ModuleShape;
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error &&
    error.name === "PdfExportError" &&
    (error as { readonly code?: unknown }).code === code;
}

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

const SPEC: StampSpecLike = Object.freeze({
  headerText: "长文",
  pageWidthPt: 595,
  pageHeightPt: 842,
  marginTopPt: 56,
  marginBottomPt: 56,
  marginLeftPt: 51,
});

/** 两页夹具：封面（对象 2）+ 正文页（对象 8，内容流 pageTwoContent）。 */
function fixture(pageTwoContent: string): Uint8Array {
  return buildPdf([
    "<</Type/Catalog>>",
    "<</Type/Page /MediaBox [0 0 595 842] /Contents 7 0 R /Resources <</Font <</F1 3 0 R>> >> >>",
    "<</Type /Font /Subtype /Type3 /FontMatrix [.001 0 0 -.001 0 0] /FirstChar 1" +
      " /LastChar 14 /FontBBox [0 -200 1000 800] /Widths [" +
      `${new Array(14).fill(500).join(" ")}]` +
      " /ToUnicode 4 0 R /FontDescriptor 5 0 R /CharProcs <</g1 6 0 R>> >>",
    streamObject(TO_UNICODE),
    "<</Type /FontDescriptor /FontName /AAAAAA+TestSans /FontFamily (Test Sans)>>",
    streamObject("500 0 0 0 500 700 d1"),
    streamObject("BT /F1 10 Tf 1 0 0 1 50 700 Tm <01> Tj ET"),
    "<</Type/Page /MediaBox [0 0 595 842] /Contents 9 0 R /Resources <</Font <</F1 3 0 R>> >> >>",
    streamObject(pageTwoContent),
  ]);
}

const CLEAN = fixture("BT /F1 10 Tf 1 0 0 1 50 400 Tm <02> Tj ET");
const OVERLAPPING = fixture("BT /F1 10 Tf 1 0 0 1 50 20 Tm <01> Tj ET");

test("stamp red: band-overlap self-check must reject content collision", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "stamp-update.ts",
      "    if (hitsHeader || hitsFooter) {",
      "    if (false) {",
    );
    const control = await importModule<StampModule>(controlDir, "stamp.ts");
    const mutated = await importModule<StampModule>(mutatedDir, "stamp.ts");
    // 控制：页脚带内既有内容 → 压印前 fail-closed。
    assert.throws(
      () => control.stampRunningHeaders(OVERLAPPING, SPEC),
      hasCode("PDF_EXPORT_STAMP_FAILED"),
    );
    // 变异：交叠内容被压印覆盖——遮挡缺陷静默产出。
    const stamped = mutated.stampRunningHeaders(OVERLAPPING, SPEC);
    assert.ok(stamped.length > OVERLAPPING.length);
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("stamp red: cover page must stay exempt", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "stamp.ts",
      "  for (const [pageIndex, page] of pages.entries()) {\n    if (pageIndex === 0) {\n      continue;\n    }",
      "  for (const [pageIndex, page] of pages.entries()) {\n    if (false) {\n      continue;\n    }",
    );
    const control = await importModule<StampModule>(controlDir, "stamp.ts");
    const mutated = await importModule<StampModule>(mutatedDir, "stamp.ts");
    const controlInspect = await importModule<InspectModule>(controlDir, "inspect.ts");
    const mutatedInspect = await importModule<InspectModule>(mutatedDir, "inspect.ts");
    const before = controlInspect.inspectPdf(CLEAN);
    // 控制：封面文本层零改动。
    const controlStamped = control.stampRunningHeaders(CLEAN, SPEC);
    assert.equal(
      controlInspect.inspectPdf(controlStamped).pages[0]?.text,
      before.pages[0]?.text,
    );
    // 变异：封面被压上页眉页脚（首面即脏），必须可见。
    const mutatedStamped = mutated.stampRunningHeaders(CLEAN, SPEC);
    assert.notEqual(
      mutatedInspect.inspectPdf(mutatedStamped).pages[0]?.text,
      before.pages[0]?.text,
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("stamp red: Tf must precede Tm in stamped content streams", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "stamp-glyphs.ts",
      '  return `BT 0 g /${firstTag ?? ""} ${STAMP_FONT_SIZE} Tf 1 0 0 1 ${x} ${y.toFixed(2)} Tm ${segments.join(" ")} ET`;',
      '  return `BT 0 g 1 0 0 1 ${x} ${y.toFixed(2)} Tm /${firstTag ?? ""} ${STAMP_FONT_SIZE} Tf ${segments.join(" ")} ET`;',
    );
    const control = await importModule<StampModule>(controlDir, "stamp.ts");
    const mutated = await importModule<StampModule>(mutatedDir, "stamp.ts");
    const controlGeometry = await importModule<GeometryModule>(
      controlDir,
      "geometry.ts",
    );
    const mutatedGeometry = await importModule<GeometryModule>(
      mutatedDir,
      "geometry.ts",
    );
    // 控制：压印流可被几何解析，正文页恰好 2 条 9pt 压印 run。
    const controlRuns = controlGeometry
      .extractGeometry(control.stampRunningHeaders(CLEAN, SPEC))
      .textRuns.filter(
        (run) => run.pageIndex === 1 && Math.abs(run.fontSize - 9) < 0.01,
      );
    assert.equal(controlRuns.length, 2);
    // 变异：Tm 先于 Tf——几何解析 fail-closed（text run without an active font）。
    assert.throws(() =>
      mutatedGeometry.extractGeometry(mutated.stampRunningHeaders(CLEAN, SPEC)),
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("inspect red: multi-tag font registration must keep every tag", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "inspect.ts",
      "        tagsByFontId.set(refId, [...(tagsByFontId.get(refId) ?? []), tag]);",
      "        tagsByFontId.set(refId, [tag]);",
    );
    const control = await importModule<StampModule>(controlDir, "stamp.ts");
    const mutated = await importModule<StampModule>(mutatedDir, "stamp.ts");
    const controlInspect = await importModule<InspectModule>(controlDir, "inspect.ts");
    const mutatedInspect = await importModule<InspectModule>(mutatedDir, "inspect.ts");
    // 控制：压印增补 PA11F tag 后，原 F1 文本仍可提取、零洞。
    const controlAfter = controlInspect.inspectPdf(
      control.stampRunningHeaders(CLEAN, SPEC),
    );
    assert.equal(controlAfter.holes.length, 0);
    assert.ok(controlAfter.pages[1]?.text.startsWith("文"));
    // 变异：单 tag 覆盖登记——原 F1 内容丢失（dev 实测 2577 洞场景复刻）。
    const mutatedAfter = mutatedInspect.inspectPdf(
      mutated.stampRunningHeaders(CLEAN, SPEC),
    );
    assert.ok(!mutatedAfter.pages[1]?.text.startsWith("文"));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("stamp red: strip verification must anchor on the exact stamped suffix", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "stamp.ts",
      "    if (!normalized.endsWith(normalizedSuffix)) {",
      "    if (false) {",
    );
    const control = await importModule<StampModule>(controlDir, "stamp.ts");
    const mutated = await importModule<StampModule>(mutatedDir, "stamp.ts");
    const controlInspect = await importModule<InspectModule>(controlDir, "inspect.ts");
    // 未压印的页文本（缺压印后缀）喂给剥离核验；页 2 文本足够长以排除 underflow 干扰。
    const unstamped = controlInspect.inspectPdf(CLEAN).pages.map((page) => page.text);
    const tampered = [unstamped[0] ?? "", `${unstamped[1] ?? ""}长长长长长长长`];
    // 控制：后缀锚定缺失即 fail-closed（压印未生效不能静默放过）。
    assert.throws(
      () => control.stripStampsForReconcile(tampered, SPEC),
      hasCode("PDF_EXPORT_STAMP_FAILED"),
    );
    // 变异：任意页尾都被当作压印剥离——对账输入被静默截短。
    const stripped = mutated.stripStampsForReconcile(tampered, SPEC);
    assert.ok(stripped.length < tampered.join("").length);
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});
