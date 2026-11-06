import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

/**
 * 源码变异测试（PA-F3）：extractOrderedText 的阅读序排序
 * （MCID 块序 → y 桶降序 → x 升序）必须因正确原因变红。
 * 机制同 metadata-mutation.unit.test.ts：真实 src 临时副本 + 单点锚定变异 +
 * 动态导入；锚点缺失/不唯一即 fail-closed。
 */

const SRC = resolve(import.meta.dirname, "../src");

async function copySources(files: readonly string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-export-sort-mutation-"));
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

interface ToUnicodeMapShape {
  readonly codeLength: number;
  readonly map: Map<number, string>;
}

interface ExtractModule {
  readonly extractOrderedText: (
    content: string,
    fonts: Map<string, ToUnicodeMapShape>,
    fontIds: Map<string, number>,
    pageIndex: number,
    baseOffset: number,
    contentObjectId: number,
  ) => { readonly text: string };
}

const SORT_ANCHOR = `  const sorted = [...runs].sort((a, b) => {
    if (a.blockOrder !== b.blockOrder) {
      return a.blockOrder - b.blockOrder;
    }
    const clusterA = Math.round(a.y / Y_BUCKET);
    const clusterB = Math.round(b.y / Y_BUCKET);
    if (clusterA !== clusterB) {
      return clusterB - clusterA;
    }
    return a.x - b.x;
  });`;

// 图表式乱序发射：同一 MCID 块内低行（下）先于高行（上）发射；
// 第二块（尾）发射在最末但 y 最高——块序优先于 y。
const CONTENT = [
  "/NonStruct <</MCID 0 >> BDC",
  "BT /F1 10 Tf",
  "1 0 0 1 100 100 Tm <01> Tj",
  "1 0 0 1 100 700 Tm <02> Tj",
  "ET",
  "EMC",
  "/NonStruct <</MCID 1 >> BDC",
  "BT /F1 10 Tf",
  "1 0 0 1 100 800 Tm <03> Tj",
  "ET",
  "EMC",
].join("\n");

function makeFonts(): Map<string, ToUnicodeMapShape> {
  return new Map([
    [
      "F1",
      {
        codeLength: 1,
        map: new Map([
          [1, "下"],
          [2, "上"],
          [3, "尾"],
        ]),
      },
    ],
  ]);
}

test("reading-order sort red: comparator governs visual order, not emission order", async () => {
  const controlDir = await copySources(["errors.ts", "extract.ts"]);
  const mutatedDir = await copySources(["errors.ts", "extract.ts"]);
  try {
    await applyMutation(
      mutatedDir,
      "extract.ts",
      SORT_ANCHOR,
      "  const sorted = [...runs];",
    );
    const control = await importModule<ExtractModule>(controlDir, "extract.ts");
    const mutated = await importModule<ExtractModule>(mutatedDir, "extract.ts");
    const extract = (mod: ExtractModule): string =>
      mod.extractOrderedText(CONTENT, makeFonts(), new Map([["F1", 7]]), 0, 0, 9).text;
    const controlText = extract(control);
    const mutatedText = extract(mutated);
    // 控制：块序优先（尾在最后），块内 y 桶降序恢复视觉阅读序。
    assert.equal(controlText, "上下尾");
    // 变异：排序被移除，退化为发射序——输出确实不同。
    assert.equal(mutatedText, "下上尾");
    assert.notEqual(controlText, mutatedText);
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});
