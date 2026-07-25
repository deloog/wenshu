import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

/**
 * 源码变异测试（PA-F3）：reconcile 的对账守卫与归一化各步必须因正确原因变红。
 * 机制同 metadata-mutation.unit.test.ts：真实 src 临时副本 + 单点锚定变异 +
 * 动态导入；锚点缺失/不唯一即 fail-closed。每个用例对照未变异控制副本，
 * 断言变异副本对同一输入的判定确实翻转。
 */

const SRC = resolve(import.meta.dirname, "../src");

async function copySources(files: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-export-reconcile-mutation-"));
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

interface ReconcileModule {
  readonly normalizePdfText: (text: string) => string;
  readonly assertPdfReconciled: (
    extracted: string,
    expected: string,
    repeatables?: readonly string[],
  ) => void;
}

async function loadPair(): Promise<{
  readonly controlDir: string;
  readonly mutatedDir: string;
  readonly control: ReconcileModule;
}> {
  const controlDir = await copySources(["errors.ts", "reconcile.ts"]);
  const mutatedDir = await copySources(["errors.ts", "reconcile.ts"]);
  return {
    controlDir,
    mutatedDir,
    control: await importModule<ReconcileModule>(controlDir, "reconcile.ts"),
  };
}

test("reconcile guard red: normalized equality short-circuit rejects any diff", async () => {
  const pair = await loadPair();
  try {
    await applyMutation(
      pair.mutatedDir,
      "reconcile.ts",
      "  if (actual === want) {",
      "  if (true) {",
    );
    const mutated = await importModule<ReconcileModule>(
      pair.mutatedDir,
      "reconcile.ts",
    );
    // 控制：一致通过；差一字以精确 code 拒绝并报首个分歧位置。
    assert.doesNotThrow(() => pair.control.assertPdfReconciled("甲乙丙", "甲乙丙"));
    assert.throws(
      () => pair.control.assertPdfReconciled("甲乙丙", "甲丙"),
      (error: unknown) =>
        hasCode("PDF_EXPORT_RECONCILE_FAILED")(error) &&
        error instanceof Error &&
        /first diff at \d+/u.test(error.message),
    );
    // 变异：等值短路恒真——任何分歧都被放行。
    assert.doesNotThrow(() => mutated.assertPdfReconciled("甲乙丙", "甲丙"));
  } finally {
    await rm(pair.controlDir, { recursive: true, force: true });
    await rm(pair.mutatedDir, { recursive: true, force: true });
  }
});

test("reconcile guard red: radical supplement maps kangxi code points", async () => {
  const pair = await loadPair();
  try {
    await applyMutation(
      pair.mutatedDir,
      "reconcile.ts",
      "    .map((char) => RADICAL_SUPPLEMENT.get(char.codePointAt(0) ?? 0) ?? char)",
      "    .map((char) => char)",
    );
    const mutated = await importModule<ReconcileModule>(
      pair.mutatedDir,
      "reconcile.ts",
    );
    // 控制：U+2ED3（康熙部首⻓，NFKC 无分解）补充映射为「长」，对账通过。
    assert.equal(pair.control.normalizePdfText("⻓"), "长");
    assert.doesNotThrow(() => pair.control.assertPdfReconciled("⻓", "长"));
    // 变异：补充表失效，部首码位原样残留——同一对账以精确 code 变红。
    assert.equal(mutated.normalizePdfText("⻓"), "⻓");
    assert.throws(
      () => mutated.assertPdfReconciled("⻓", "长"),
      hasCode("PDF_EXPORT_RECONCILE_FAILED"),
    );
    // 变异副本的 NFKC 步仍然有效（仅部首补充这一步失效）。
    assert.equal(mutated.normalizePdfText("（）"), "()");
  } finally {
    await rm(pair.controlDir, { recursive: true, force: true });
    await rm(pair.mutatedDir, { recursive: true, force: true });
  }
});

test("reconcile guard red: layout whitespace strip reconciles reflowed text", async () => {
  const pair = await loadPair();
  try {
    await applyMutation(
      pair.mutatedDir,
      "reconcile.ts",
      '    .replaceAll(/\\s+/gu, "");',
      "    ;",
    );
    const mutated = await importModule<ReconcileModule>(
      pair.mutatedDir,
      "reconcile.ts",
    );
    // 控制：布局空白被剥离，重排文本与真源对账通过。
    assert.equal(pair.control.normalizePdfText("甲 乙\t丙"), "甲乙丙");
    assert.doesNotThrow(() => pair.control.assertPdfReconciled("甲 乙", "甲乙"));
    // 变异：空白剥离失效——同一对账以精确 code 变红。
    assert.equal(mutated.normalizePdfText("甲 乙"), "甲 乙");
    assert.throws(
      () => mutated.assertPdfReconciled("甲 乙", "甲乙"),
      hasCode("PDF_EXPORT_RECONCILE_FAILED"),
    );
  } finally {
    await rm(pair.controlDir, { recursive: true, force: true });
    await rm(pair.mutatedDir, { recursive: true, force: true });
  }
});
