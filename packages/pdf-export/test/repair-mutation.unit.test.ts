import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { deflateSync } from "node:zlib";

/**
 * 源码变异测试（PA-F3）：cmap-repair 修复层各路径必须因正确原因变红——
 * 快速路径、受约束对齐的 fail-closed、对齐推断错误被重新验证拦截。
 * 机制同 metadata-mutation.unit.test.ts：真实 src 临时副本 + 单点锚定变异 +
 * 动态导入；锚点缺失/不唯一即 fail-closed。
 * 合成 PDF 字节夹具（最小对象集 + trailer）仿照 geometry.unit.test.ts 的手工构造。
 */

const SRC = resolve(import.meta.dirname, "../src");

const REPAIR_FILES = Object.freeze([
  "errors.ts",
  "extract.ts",
  "inspect.ts",
  "reconcile.ts",
  "pdf-patch.ts",
  "cmap-repair.ts",
]);

async function copySources(files: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-export-repair-mutation-"));
  await Promise.all(files.map((file) => copyFile(join(SRC, file), join(dir, file))));
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

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error &&
    error.name === "PdfExportError" &&
    (error as { readonly code?: unknown }).code === code;
}

interface RepairModule {
  readonly alignHoles: (
    extraction: {
      readonly text: string;
      readonly holes: readonly unknown[];
      readonly origins: readonly unknown[];
    },
    expectedText: string,
    repeatables?: readonly string[],
  ) => { readonly holeAssignments: ReadonlyMap<number, string> };
  readonly repairPdfTextLayer: (
    original: Uint8Array,
    expectedText: string,
    repeatables?: readonly string[],
  ) => {
    readonly pdfBytes: Uint8Array;
    readonly repairedHoles: number;
    readonly patchedObjects: number;
  };
}

function streamObject(data: string): string {
  const compressed = deflateSync(Buffer.from(data, "latin1"));
  return `<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${compressed.toString("latin1")}\nendstream`;
}

function buildPdf(objects: readonly string[]): Uint8Array {
  const body = objects
    .map((object, index) => `${index + 1} 0 obj\n${object}\nendobj`)
    .join("\n");
  const trailer = `trailer\n<</Size ${objects.length + 1} /Root 1 0 R>>\nstartxref\n0\n%%EOF\n`;
  return new Uint8Array(Buffer.from(`%PDF-1.7\n${body}\n${trailer}`, "latin1"));
}

function toUnicodeCMap(entries: readonly (readonly [string, string])[]): string {
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<01> <FF>",
    "endcodespacerange",
    `${entries.length} beginbfchar`,
    ...entries.map(([code, dest]) => `<${code}> <${dest}>`),
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
  ].join("\n");
}

function fixturePdf(content: string, toUnicode: string): Uint8Array {
  return buildPdf([
    "<</Type /Catalog /Pages 2 0 R>>",
    "<</Type /Pages /Kids [3 0 R] /Count 1>>",
    "<</Type /Page /MediaBox [0 0 600 800]" +
      " /Resources <</Font <</F1 4 0 R>> >> /Contents 5 0 R>>",
    "<</Type /Font /Subtype /Type1 /BaseFont /AAAAAA+TestSans /ToUnicode 6 0 R>>",
    streamObject(content),
    streamObject(toUnicode),
  ]);
}

// 洞夹具：内容用到码 03，ToUnicode 只映射 01→甲 02→乙——一个字形洞。
// 期望文本「甲丙乙」：洞（码 03）应对齐推断为「丙」。
const HOLED_PDF = fixturePdf(
  "BT /F1 10 Tf 1 0 0 1 100 700 Tm <010302> Tj ET",
  toUnicodeCMap([
    ["01", "7532"],
    ["02", "4E59"],
  ]),
);
// 干净夹具：全部码位有映射，对账直接通过。
const CLEAN_PDF = fixturePdf(
  "BT /F1 10 Tf 1 0 0 1 100 700 Tm <0102> Tj ET",
  toUnicodeCMap([
    ["01", "7532"],
    ["02", "4E59"],
  ]),
);

async function loadPair(): Promise<{
  readonly controlDir: string;
  readonly mutatedDir: string;
  readonly control: RepairModule;
}> {
  const controlDir = await copySources(REPAIR_FILES);
  const mutatedDir = await copySources(REPAIR_FILES);
  return {
    controlDir,
    mutatedDir,
    control: await importModule<RepairModule>(controlDir, "cmap-repair.ts"),
  };
}

test("repair fast path red: clean pdf returns byte-identical without patching", async () => {
  const pair = await loadPair();
  try {
    await applyMutation(
      pair.mutatedDir,
      "cmap-repair.ts",
      "  if (before.holes.length === 0) {",
      "  if (before.holes.length === -1) {",
    );
    const mutated = await importModule<RepairModule>(pair.mutatedDir, "cmap-repair.ts");
    // 控制：无洞且对账通过——快速路径原样返回，不追加增量更新。
    const controlResult = pair.control.repairPdfTextLayer(CLEAN_PDF, "甲乙");
    assert.equal(controlResult.repairedHoles, 0);
    assert.equal(controlResult.patchedObjects, 0);
    assert.equal(controlResult.pdfBytes.length, CLEAN_PDF.length);
    // 变异：快速路径失效，干净 PDF 被送入完整修复流并追加增量更新字节。
    const mutatedResult = mutated.repairPdfTextLayer(CLEAN_PDF, "甲乙");
    assert.ok(mutatedResult.pdfBytes.length > CLEAN_PDF.length);
  } finally {
    await rm(pair.controlDir, { recursive: true, force: true });
    await rm(pair.mutatedDir, { recursive: true, force: true });
  }
});

test("repair layer red: wrong hole assignment is caught by re-inspection", async () => {
  const pair = await loadPair();
  try {
    await applyMutation(
      pair.mutatedDir,
      "cmap-repair.ts",
      '      assignments.set(hole.offset, expected[cursor] ?? "");',
      '      assignments.set(hole.offset, "？");',
    );
    const mutated = await importModule<RepairModule>(pair.mutatedDir, "cmap-repair.ts");
    // 控制：洞被正确修复——重新检查零洞、前缀不变、对账通过。
    const controlResult = pair.control.repairPdfTextLayer(HOLED_PDF, "甲丙乙");
    assert.equal(controlResult.repairedHoles, 1);
    assert.equal(controlResult.patchedObjects, 1);
    assert.ok(
      Buffer.from(controlResult.pdfBytes)
        .subarray(0, HOLED_PDF.length)
        .equals(Buffer.from(HOLED_PDF)),
    );
    // 变异：对齐推断写入错误字符——重新验证（re-inspect + 逐字对账）必须拦截，
    // 以精确 code 变红而非产出错标 PDF。
    assert.throws(
      () => mutated.repairPdfTextLayer(HOLED_PDF, "甲丙乙"),
      hasCode("PDF_EXPORT_RECONCILE_FAILED"),
    );
  } finally {
    await rm(pair.controlDir, { recursive: true, force: true });
    await rm(pair.mutatedDir, { recursive: true, force: true });
  }
});
