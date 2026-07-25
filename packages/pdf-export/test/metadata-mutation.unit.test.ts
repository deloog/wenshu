import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

/**
 * 源码变异测试（PA-F3）：metadata-policy 的每条守卫必须因正确原因变红。
 * 机制：把真实 src 复制到临时目录，施加单点锚定变异后动态导入变异副本，
 * 与未变异控制副本对同一输入的判定对比。锚点缺失/不唯一即失败
 * （fail-closed，源码漂移时本测试自身保持决定性）。每个用例三断言：
 * (a) 控制副本接受良性输入；(b) 控制副本以精确 code 拒绝违规输入；
 * (c) 变异副本对同一违规输入不再拒绝——守卫确因该锚点失效。
 */

const SRC = resolve(import.meta.dirname, "../src");

async function copySources(files: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-export-meta-mutation-"));
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

interface MetadataPolicyModule {
  readonly assertMetadataPolicy: (
    metadata: Readonly<Record<string, string>>,
    xmp: string | null,
    expectedTitle: string,
  ) => void;
}

const GOOD_METADATA: Readonly<Record<string, string>> = {
  Title: "文档标题",
  Producer: "Skia/PDF m150",
  Creator:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36",
  CreationDate: "D:20260724000000+00'00'",
};

interface MetadataCase {
  readonly name: string;
  readonly anchor: string;
  readonly replacement: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly xmp: string | null;
}

const METADATA_CASES: readonly MetadataCase[] = [
  {
    name: "ALLOWED_KEYS whitelist rejects upstream identity fields",
    anchor: "    if (!ALLOWED_KEYS.has(key)) {",
    replacement: "    if (false) {",
    metadata: { ...GOOD_METADATA, Author: "张三" },
    xmp: null,
  },
  {
    name: "title equality rejects a foreign title",
    anchor: '  if (metadata["Title"] !== expectedTitle) {',
    replacement: "  if (false) {",
    metadata: { ...GOOD_METADATA, Title: "别的标题" },
    xmp: null,
  },
  {
    name: "producer must be the Skia engine constant",
    anchor: "  if (!/^Skia\\/PDF/u.test(producer)) {",
    replacement: "  if (false) {",
    metadata: { ...GOOD_METADATA, Producer: "Microsoft Word" },
    xmp: null,
  },
  {
    name: "creator must be the engine UA constant",
    anchor: "    creator !== undefined &&",
    replacement: "    creator !== undefined && false &&",
    metadata: { ...GOOD_METADATA, Creator: "WPS Office 用户" },
    xmp: null,
  },
  {
    name: "xmp scan rejects upstream identity markers",
    anchor: "  if (xmp !== null && /author|company|creator(?!Tool)/iu.test(xmp)) {",
    replacement: "  if (false) {",
    metadata: GOOD_METADATA,
    xmp: "<x:xmpmeta><rdf:Description dc:author>someone</rdf:Description></x:xmpmeta>",
  },
];

for (const metadataCase of METADATA_CASES) {
  test(`metadata policy guard red: ${metadataCase.name}`, async () => {
    const controlDir = await copySources(["errors.ts", "metadata-policy.ts"]);
    const mutatedDir = await copySources(["errors.ts", "metadata-policy.ts"]);
    try {
      await applyMutation(
        mutatedDir,
        "metadata-policy.ts",
        metadataCase.anchor,
        metadataCase.replacement,
      );
      const control = await importModule<MetadataPolicyModule>(
        controlDir,
        "metadata-policy.ts",
      );
      const mutated = await importModule<MetadataPolicyModule>(
        mutatedDir,
        "metadata-policy.ts",
      );
      const call = (mod: MetadataPolicyModule): void =>
        mod.assertMetadataPolicy(metadataCase.metadata, metadataCase.xmp, "文档标题");
      // (a) 控制副本：良性输入通过。
      assert.doesNotThrow(() =>
        control.assertMetadataPolicy(GOOD_METADATA, null, "文档标题"),
      );
      // (b) 控制副本：违规输入以精确 code 拒绝（正确层级、正确原因）。
      assert.throws(() => call(control), hasCode("PDF_EXPORT_METADATA_POLICY"));
      // (c) 变异副本：同一违规输入不再被拒绝——守卫确因该锚点失效。
      assert.doesNotThrow(() => call(mutated));
      // 变异不破坏良性路径（守卫整体未被移除，仅该条失效）。
      assert.doesNotThrow(() =>
        mutated.assertMetadataPolicy(GOOD_METADATA, null, "文档标题"),
      );
    } finally {
      await rm(controlDir, { recursive: true, force: true });
      await rm(mutatedDir, { recursive: true, force: true });
    }
  });
}
