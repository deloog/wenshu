import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

/**
 * 源码变异测试（PA-F3）：cmap-repair 受约束对齐（alignHoles）的 fail-closed 必须因正确原因变红。
 * 机制同 metadata-mutation.unit.test.ts：真实 src 临时副本 + 单点锚定变异 +
 * 动态导入；锚点缺失/不唯一即 fail-closed。
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

test("alignHoles red: unconsumed expected text is fail-closed", async () => {
  const pair = await loadPair();
  try {
    await applyMutation(
      pair.mutatedDir,
      "cmap-repair.ts",
      "  if (cursor !== expected.length) {",
      "  if (false) {",
    );
    const mutated = await importModule<RepairModule>(pair.mutatedDir, "cmap-repair.ts");
    const extraction = Object.freeze({
      text: "甲",
      holes: Object.freeze([]),
      origins: Object.freeze([null]),
    });
    // 控制：真源多出一字（甲乙 vs 提取甲）以精确 code 与原因拒绝。
    assert.throws(
      () => pair.control.alignHoles(extraction, "甲乙"),
      (error: unknown) =>
        hasCode("PDF_EXPORT_RECONCILE_FAILED")(error) &&
        error instanceof Error &&
        /not fully consumed/u.test(error.message),
    );
    // 变异：未消费检查失效——同一分歧被静默放行。
    const result = mutated.alignHoles(extraction, "甲乙");
    assert.equal(result.holeAssignments.size, 0);
  } finally {
    await rm(pair.controlDir, { recursive: true, force: true });
    await rm(pair.mutatedDir, { recursive: true, force: true });
  }
});

test("alignHoles red: unmappable divergence without glyph origin is fail-closed", async () => {
  const pair = await loadPair();
  try {
    await applyMutation(
      pair.mutatedDir,
      "cmap-repair.ts",
      "      if (origin === null || origin === undefined || expected[cursor] === undefined) {",
      "      if (false) {",
    );
    const mutated = await importModule<RepairModule>(pair.mutatedDir, "cmap-repair.ts");
    // 分歧字符无字形来源（origin 为 null）：不可映射，必须 fail-closed。
    const extraction = Object.freeze({
      text: "甲",
      holes: Object.freeze([]),
      origins: Object.freeze([null]),
    });
    // 控制：以精确 code 与原因拒绝。
    assert.throws(
      () => pair.control.alignHoles(extraction, "乙"),
      (error: unknown) =>
        hasCode("PDF_EXPORT_RECONCILE_FAILED")(error) &&
        error instanceof Error &&
        /unresolvable divergence/u.test(error.message),
    );
    // 变异：守卫被移除——拒绝不再来自该守卫（退化为空指针 TypeError），
    // 绝不允许以 guard 的语义放行。
    let mutatedError: unknown;
    try {
      mutated.alignHoles(extraction, "乙");
    } catch (error) {
      mutatedError = error;
    }
    assert.ok(mutatedError !== undefined, "mutated alignHoles must not accept");
    assert.equal(
      hasCode("PDF_EXPORT_RECONCILE_FAILED")(mutatedError),
      false,
      "rejection must no longer come from the removed guard",
    );
  } finally {
    await rm(pair.controlDir, { recursive: true, force: true });
    await rm(pair.mutatedDir, { recursive: true, force: true });
  }
});
