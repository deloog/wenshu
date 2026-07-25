import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

/**
 * 源码变异测试（PA-06B / 决策 #10 命门）：figure 成员标记与绘制框的数据来源
 * 必须因正确原因变红。
 * 1. 成员判定退回几何启发式（bbox-in-bbox）→ 「几何落入但结构非成员」用例变红；
 * 2. clip 路径计入绘制框 → 「clip 不绘制」用例变红。
 * 机制同 reconcile-mutation.unit.test.ts：真实 src 临时副本 + 单点锚定变异 +
 * 动态导入；锚点缺失/不唯一即 fail-closed；对照未变异副本必须保持绿。
 */

const SRC = resolve(import.meta.dirname, "../src");
const FILES = ["errors.ts", "geometry-marks.ts", "geometry-text.ts"] as const;

interface Type3FontGeometry {
  readonly objectId: number;
  readonly ref: unknown;
  readonly codeLength: number;
  readonly map: Map<number, string>;
  readonly firstChar: number;
  readonly widths: readonly number[];
  readonly fontMatrix: readonly number[];
  readonly fontBBox: readonly number[];
}

interface GeometryRun {
  readonly text: string;
  readonly figureMcid: number | null;
}

interface FigureBoxShape {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly paintMinX: number;
  readonly paintMinY: number;
  readonly paintMaxX: number;
  readonly paintMaxY: number;
}

interface ContentGeometry {
  readonly runs: readonly GeometryRun[];
  readonly figures: readonly { readonly mcid: number; readonly box: FigureBoxShape }[];
}

interface GeometryTextModule {
  readonly extractContentGeometry: (
    content: string,
    fonts: Map<string, Type3FontGeometry>,
    pageIndex: number,
  ) => ContentGeometry;
}

const FONT: Type3FontGeometry = {
  objectId: 3,
  ref: {
    objectId: 3,
    tag: "F1",
    family: "Test Sans",
    weight: 700,
    subset: true,
    embedded: true,
  },
  codeLength: 1,
  map: new Map([
    [1, "A"],
    [2, "B"],
  ]),
  firstChar: 1,
  widths: [500, 250],
  fontMatrix: [0.001, 0, 0, -0.001, 0, 0],
  fontBBox: [0, -200, 1000, 800],
};

/** 基线 p7 的真实形态缩影：clip 撑起 bbox，span 外文本几何落入 bbox。 */
const MEMBERSHIP_CONTENT = [
  "/Figure <</MCID 5 >>BDC",
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
  "1 0 0 1 300 400 Tm <02> Tj",
  "ET",
  "EMC",
].join("\n");

const CLIP_CONTENT = [
  "/Figure <</MCID 2 >>BDC",
  "0 0 600 800 re",
  "W* n",
  "100 600 200 100 re",
  "f",
  "EMC",
].join("\n");

function assertMembershipFacts(module: GeometryTextModule): void {
  const result = module.extractContentGeometry(
    MEMBERSHIP_CONTENT,
    new Map([["F1", FONT]]),
    0,
  );
  const member = result.runs.find((run) => run.text === "A");
  const outsider = result.runs.find((run) => run.text === "B");
  assert.equal(member?.figureMcid, 5, "span 内字形必须是成员");
  assert.equal(
    outsider?.figureMcid,
    null,
    "几何落入 figure bbox 但结构非成员的 run 必须判非成员",
  );
}

function assertClipNotPainted(module: GeometryTextModule): void {
  const result = module.extractContentGeometry(
    CLIP_CONTENT,
    new Map([["F1", FONT]]),
    0,
  );
  const box = result.figures[0]?.box;
  assert.ok(box !== undefined);
  assert.equal(box.minX, 0, "clip 计入 bbox（既有语义）");
  assert.equal(box.paintMinX, 100, "clip 不得计入绘制框");
  assert.equal(box.paintMaxX, 300);
  assert.equal(box.paintMaxY, 700);
}

async function copySources(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pdf-export-marks-mutation-"));
  await Promise.all(FILES.map((file) => copyFile(join(SRC, file), join(dir, file))));
  return dir;
}

async function applyMutation(
  dir: string,
  anchor: string,
  replacement: string,
): Promise<void> {
  const path = join(dir, "geometry-text.ts");
  const source = await readFile(path, "utf8");
  assert.ok(source.includes(anchor), "mutation anchor not found; source drifted");
  assert.equal(
    source.indexOf(anchor),
    source.lastIndexOf(anchor),
    "mutation anchor must be unique",
  );
  await writeFile(path, source.replace(anchor, replacement), "utf8");
}

async function importModule(dir: string): Promise<GeometryTextModule> {
  return (await import(
    pathToFileURL(join(dir, "geometry-text.ts")).href
  )) as GeometryTextModule;
}

test("membership source red: bbox-in-bbox geometric heuristic flips the outsider", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      "        figureMcid: run.figureMixed ? null : run.glyphFigure,",
      [
        "        figureMcid: (() => {",
        "          for (const figure of figures) {",
        "            const { minX, minY, maxX, maxY } = figure.box;",
        "            if (",
        "              bbox.x >= minX &&",
        "              bbox.x + bbox.width <= maxX &&",
        "              bbox.y <= maxY &&",
        "              bbox.y - bbox.height >= minY",
        "            ) {",
        "              return figure.mcid;",
        "            }",
        "          }",
        "          return null;",
        "        })(),",
      ].join("\n"),
    );
    const control = await importModule(controlDir);
    const mutated = await importModule(mutatedDir);
    // 对照：结构成员判定绿。
    assertMembershipFacts(control);
    // 变异：几何启发式把 span 外的 run B 误判为成员 → 同一断言变红。
    assert.throws(() => assertMembershipFacts(mutated), assert.AssertionError);
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});

test("paint extent red: counting clip paths as painted inflates the painted bbox", async () => {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(
      mutatedDir,
      [
        '    if (g["discard"] !== undefined) {',
        "      pathPoints = [];",
        "      continue;",
        "    }",
      ].join("\n"),
      [
        '    if (g["discard"] !== undefined) {',
        "      growFigurePaint(markStack, ctm, pathPoints);",
        "      pathPoints = [];",
        "      continue;",
        "    }",
      ].join("\n"),
    );
    const control = await importModule(controlDir);
    const mutated = await importModule(mutatedDir);
    assertClipNotPainted(control);
    assert.throws(() => assertClipNotPainted(mutated), assert.AssertionError);
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
});
