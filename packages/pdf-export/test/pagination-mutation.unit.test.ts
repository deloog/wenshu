import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

/**
 * 源码变异测试（PA-11A）：目录页码测量与两遍填充守卫各路径必须因正确原因
 * 变红——大纲匹配收紧、/XYZ 限定、页码 off-by-one、不动点轮数上限、收敛判定、
 * 反馈游标、占位恰好一次与缺页码守卫。机制同 repair-mutation.unit.test.ts：
 * 真实 src 临时副本 + 单点锚定变异 + 动态导入；锚点缺失/不唯一即 fail-closed。
 */

const SRC = resolve(import.meta.dirname, "../src");

const PAGINATION_FILES = Object.freeze([
  "errors.ts",
  "extract.ts",
  "inspect.ts",
  "reconcile.ts",
  "pagination.ts",
  "compose.ts",
]);

async function copySources(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-export-pagination-mutation-"));
  await Promise.all(
    PAGINATION_FILES.map((file) => copyFile(join(SRC, file), join(dir, file))),
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

interface TocEntryLike {
  readonly id: string;
  readonly title: string;
  readonly level: number;
}

interface PaginationModule {
  readonly measureTocPageNumbers: (
    bytes: Uint8Array,
    entries: readonly TocEntryLike[],
  ) => ReadonlyMap<string, number>;
  readonly resolveStableTocPages: (
    initial: ReadonlyMap<string, number>,
    renderAndMeasure: (
      pages: ReadonlyMap<string, number>,
    ) => Promise<ReadonlyMap<string, number>>,
  ) => Promise<ReadonlyMap<string, number>>;
}

interface ComposeModule {
  readonly fillTocPageNumbers: (
    printHtml: string,
    entries: readonly TocEntryLike[],
    tocPages: ReadonlyMap<string, number>,
  ) => string;
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

function buildPdf(objects: readonly string[]): Uint8Array {
  const body = objects
    .map((object, index) => `${index + 1} 0 obj\n${object}\nendobj`)
    .join("\n");
  return new Uint8Array(Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, "latin1"));
}

function titleHex(text: string): string {
  return `FEFF${Buffer.from(text, "utf16le").swap16().toString("hex").toUpperCase()}`;
}

const entry = (id: string, title: string): TocEntryLike =>
  Object.freeze({ id, title, level: 1 });

/** 双现同文标题夹具：游标按文档序消歧（报告→p1/p2，执行摘要→p3）。 */
const CURSOR_PDF = buildPdf([
  "<</Type/Catalog/Outlines 5 0 R>>",
  "<</Type/Page>>",
  "<</Type/Page>>",
  "<</Type/Page>>",
  "<</Type/Outlines/First 6 0 R/Last 6 0 R>>",
  `<</Title <${titleHex("报告")}>/Dest [2 0 R /XYZ 0 0 0]/Parent 5 0 R/Next 7 0 R>>`,
  `<</Title <${titleHex("报告")}>/Dest [3 0 R /XYZ 0 0 0]/Parent 5 0 R/Next 8 0 R>>`,
  `<</Title <${titleHex("执行摘要")}>/Dest [4 0 R /XYZ 0 0 0]/Parent 5 0 R>>`,
]);

/** 大纲项标题与目录条目完全不匹配的夹具。 */
const MISMATCH_PDF = buildPdf([
  "<</Type/Catalog/Outlines 3 0 R>>",
  "<</Type/Page>>",
  "<</Type/Outlines/First 4 0 R/Last 4 0 R>>",
  `<</Title <${titleHex("别的")}>/Dest [2 0 R /XYZ 0 0 0]/Parent 3 0 R>>`,
]);

/** /Fit 形式 Dest 夹具（非 /XYZ 必须 fail-closed）。 */
const FIT_DEST_PDF = buildPdf([
  "<</Type/Catalog/Outlines 3 0 R>>",
  "<</Type/Page>>",
  "<</Type/Outlines/First 4 0 R/Last 4 0 R>>",
  `<</Title <${titleHex("章")}>/Dest [2 0 R /Fit]/Parent 3 0 R>>`,
]);

test("pagination red: outline title match must not degrade to any-item acceptance", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "pagination.ts",
      "      if (item !== undefined && normalizePdfText(item.title) === want) {",
      "      if (item !== undefined) {",
    );
    const control = await importModule<PaginationModule>(controlDir, "pagination.ts");
    const mutated = await importModule<PaginationModule>(mutatedDir, "pagination.ts");
    // 控制：条目在大纲中无后继匹配即 fail-closed。
    assert.throws(
      () =>
        control.measureTocPageNumbers(MISMATCH_PDF, [entry("node_a", "不存在的标题")]),
      hasCode("PDF_EXPORT_PAGINATION_FAILED"),
    );
    // 变异：任意大纲项都被接受——错位页码静默产出（漏检），必须可见。
    const pages = mutated.measureTocPageNumbers(MISMATCH_PDF, [
      entry("node_a", "不存在的标题"),
    ]);
    assert.equal(pages.get("node_a"), 1);
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("pagination red: non-XYZ destinations must stay rejected", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "pagination.ts",
      String.raw`      const dest = /\/Dest\s*\[\s*(\d+)\s+0\s+R\s+\/XYZ/u.exec(node.dict)?.[1];`,
      String.raw`      const dest = /\/Dest\s*\[\s*(\d+)\s+0\s+R/u.exec(node.dict)?.[1];`,
    );
    const control = await importModule<PaginationModule>(controlDir, "pagination.ts");
    const mutated = await importModule<PaginationModule>(mutatedDir, "pagination.ts");
    // 控制：/Fit 形式 fail-closed。
    assert.throws(
      () => control.measureTocPageNumbers(FIT_DEST_PDF, [entry("node_a", "章")]),
      hasCode("PDF_EXPORT_PAGINATION_FAILED"),
    );
    // 变异：未知 Dest 形式被当作页码事实接受。
    assert.equal(
      mutated
        .measureTocPageNumbers(FIT_DEST_PDF, [entry("node_a", "章")])
        .get("node_a"),
      1,
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("pagination red: page numbers are one-based physical pages", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "pagination.ts",
      "        matched = pageIndex + 1;",
      "        matched = pageIndex;",
    );
    const control = await importModule<PaginationModule>(controlDir, "pagination.ts");
    const mutated = await importModule<PaginationModule>(mutatedDir, "pagination.ts");
    const entries = [
      entry("node_a", "报告"),
      entry("node_b", "报告"),
      entry("node_c", "执行摘要"),
    ];
    // 控制：物理页码 1/2/3（文档序游标消歧同文标题）。
    const controlPages = control.measureTocPageNumbers(CURSOR_PDF, entries);
    assert.deepEqual(
      [
        controlPages.get("node_a"),
        controlPages.get("node_b"),
        controlPages.get("node_c"),
      ],
      [1, 2, 3],
    );
    // 变异：off-by-one 页码必须可见（目录页码是读者可见事实，不允许静默漂移）。
    const mutatedPages = mutated.measureTocPageNumbers(CURSOR_PDF, entries);
    assert.deepEqual(
      [
        mutatedPages.get("node_a"),
        mutatedPages.get("node_b"),
        mutatedPages.get("node_c"),
      ],
      [0, 1, 2],
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("pagination red: convergence round budget must not shrink", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "pagination.ts",
      "  for (let round = 0; round < MAX_PAGINATION_ROUNDS; round += 1) {",
      "  for (let round = 0; round < 1; round += 1) {",
    );
    const control = await importModule<PaginationModule>(controlDir, "pagination.ts");
    const mutated = await importModule<PaginationModule>(mutatedDir, "pagination.ts");
    // 第二轮收敛的喂件：M0 → M1 → M1。
    const m0: ReadonlyMap<string, number> = new Map([["node_a", 3]]);
    const m1: ReadonlyMap<string, number> = new Map([["node_a", 4]]);
    const feed = async (): Promise<ReadonlyMap<string, number>> => m1;
    let controlCalls = 0;
    const controlResult = await control.resolveStableTocPages(m0, async () => {
      controlCalls += 1;
      return feed();
    });
    assert.equal(controlCalls, 2);
    assert.equal(controlResult.get("node_a"), 4);
    // 变异：轮数上限收缩使合法收敛被判失败（可用性防线，防悄然调参）。
    await assert.rejects(
      mutated.resolveStableTocPages(m0, feed),
      hasCode("PDF_EXPORT_PAGINATION_FAILED"),
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("pagination red: convergence acceptance must compare measured pages", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "pagination.ts",
      "    if (mapsEqual(remeasured, current)) {",
      "    if (true) {",
    );
    const control = await importModule<PaginationModule>(controlDir, "pagination.ts");
    const mutated = await importModule<PaginationModule>(mutatedDir, "pagination.ts");
    // 永不收敛的喂件：每轮返回递增页码。
    let calls = 0;
    const diverging = async (): Promise<ReadonlyMap<string, number>> => {
      calls += 1;
      return new Map([["node_a", calls]]);
    };
    // 控制：恰好 3 轮后 fail-closed。
    calls = 0;
    await assert.rejects(
      control.resolveStableTocPages(new Map([["node_a", 0]]), diverging),
      hasCode("PDF_EXPORT_PAGINATION_FAILED"),
    );
    assert.equal(calls, 3);
    // 变异：首轮即假收敛——未稳定的页码被当作终值产出。
    calls = 0;
    const mutatedResult = await mutated.resolveStableTocPages(
      new Map([["node_a", 0]]),
      diverging,
    );
    assert.equal(calls, 1);
    assert.equal(mutatedResult.get("node_a"), 1);
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("pagination red: feedback cursor must carry remeasured pages into next round", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "pagination.ts",
      "    current = remeasured;",
      "    current = current;",
    );
    const control = await importModule<PaginationModule>(controlDir, "pagination.ts");
    const mutated = await importModule<PaginationModule>(mutatedDir, "pagination.ts");
    // 依赖当前页码的喂件：只有收到 M1 才返回 M1（收敛），否则继续漂移。
    const m1: ReadonlyMap<string, number> = new Map([["node_a", 4]]);
    const feed = async (pages: ReadonlyMap<string, number>) =>
      pages.get("node_a") === 4
        ? m1
        : new Map([["node_a", (pages.get("node_a") ?? 0) + 1]]);
    const controlResult = await control.resolveStableTocPages(
      new Map([["node_a", 3]]),
      feed,
    );
    assert.equal(controlResult.get("node_a"), 4);
    // 变异：反馈断开——调用方永远收不到重测值，必然假发散 fail-closed。
    await assert.rejects(
      mutated.resolveStableTocPages(new Map([["node_a", 3]]), feed),
      hasCode("PDF_EXPORT_PAGINATION_FAILED"),
    );
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("pagination red: placeholder must appear exactly once per entry", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "compose.ts",
      "    if (occurrences !== 1) {",
      "    if (occurrences === 0) {",
    );
    const control = await importModule<ComposeModule>(controlDir, "compose.ts");
    const mutated = await importModule<ComposeModule>(mutatedDir, "compose.ts");
    const placeholder = '<span class="toc-entry-page" data-toc-target="node_a"></span>';
    const entries = [entry("node_a", "甲")];
    const pages: ReadonlyMap<string, number> = new Map([["node_a", 3]]);
    // 控制：占位出现两次（结构漂移）即 fail-closed。
    assert.throws(
      () => control.fillTocPageNumbers(placeholder + placeholder, entries, pages),
      hasCode("PDF_EXPORT_PAGINATION_FAILED"),
    );
    // 变异：重复占位被静默填充第一处——页码可能落到错误条目上。
    const filled = mutated.fillTocPageNumbers(
      placeholder + placeholder,
      entries,
      pages,
    );
    assert.ok(filled.includes('data-toc-target="node_a">3</span>'));
    assert.ok(filled.includes('data-toc-target="node_a"></span>'));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("pagination red: missing measured page must not render as text", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "compose.ts",
      "    if (page === undefined) {",
      "    if (false) {",
    );
    const control = await importModule<ComposeModule>(controlDir, "compose.ts");
    const mutated = await importModule<ComposeModule>(mutatedDir, "compose.ts");
    const placeholder = '<span class="toc-entry-page" data-toc-target="node_a"></span>';
    const entries = [entry("node_a", "甲")];
    // 控制：条目缺实测页码即 fail-closed（禁猜页码）。
    assert.throws(
      () => control.fillTocPageNumbers(placeholder, entries, new Map()),
      hasCode("PDF_EXPORT_PAGINATION_FAILED"),
    );
    // 变异：缺页码被渲染成 "undefined" 字符串进入目录。
    const filled = mutated.fillTocPageNumbers(placeholder, entries, new Map());
    assert.ok(filled.includes("undefined"));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});
