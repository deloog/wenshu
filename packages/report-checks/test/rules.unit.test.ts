/**
 * P0 规则与运行器单元测试：合成证据（纯函数层，不触文件系统）。
 * 覆盖每规则正反、贴边合法、同行字距豁免、单规则回滚、确定性。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { WenshuDocument } from "@wenshu/document-model";
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";

import { ReportChecksError } from "../src/check-input.ts";
import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { runP0Checks } from "../src/runner.ts";
import { p0BoundsRule } from "../src/rules/p0-bounds.ts";
import { p0ContentRule } from "../src/rules/p0-content.ts";
import { p0OverlapRule } from "../src/rules/p0-overlap.ts";
import { p0PageSizeRule } from "../src/rules/p0-page-size.ts";

const SHA = "a".repeat(64);
const FONT = {
  objectId: 4,
  tag: "F1",
  family: "Test Sans",
  weight: 400,
  subset: true,
  embedded: true,
} as const;
const CONTENT_BOX = contentBoxFromMargins(
  { top: 20, right: 18, bottom: 20, left: 18 },
  595.28,
  841.89,
);

let runSeq = 0;
function makeRun(over: {
  pageIndex?: number;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  baselineY?: number;
  fontSize?: number;
  blockOrder?: number;
  figureMcid?: number | null;
}): WenshuPdfEvidence["textRuns"][number] {
  runSeq += 1;
  const baselineY = over.baselineY ?? (over.y ?? 780) - 10;
  return {
    pageIndex: over.pageIndex ?? 0,
    text: over.text ?? "字",
    bbox: {
      x: over.x ?? 60,
      y: over.y ?? 780,
      width: over.width ?? 10,
      height: over.height ?? 12,
    },
    baselineY,
    fontSize: over.fontSize ?? 12,
    font: FONT,
    blockOrder: over.blockOrder ?? 1,
    readingOrder: runSeq - 1,
    viaActualText: false,
    figureMcid: over.figureMcid ?? null,
  };
}

function makeFigure(over: {
  mcid?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  paintBBox?: { x: number; y: number; width: number; height: number };
}): WenshuPdfEvidence["figures"][number] {
  const bbox = over.bbox ?? { x: 51, y: 785, width: 493, height: 728 };
  return {
    pageIndex: 0,
    mcid: over.mcid ?? 0,
    bbox,
    paintBBox: over.paintBBox ?? { x: 87, y: 785, width: 421, height: 239 },
    kind: "vector-figure",
    altShort: null,
    altLong: null,
  };
}

function makeEvidence(over: Partial<WenshuPdfEvidence>): WenshuPdfEvidence {
  return {
    evidenceVersion: "1.1.0",
    source: { sha256: SHA, pageCount: 1, producer: "Skia/PDF m150" },
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        widthPt: 595.28,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
    textRuns: [],
    figures: [],
    fonts: [{ name: "A+TestSans", ...FONT, subtype: "Type3" }],
    ...over,
  };
}

function makeInput(
  evidence: WenshuPdfEvidence,
  expected: ReturnType<typeof buildExpectedBlocks> = [],
) {
  return { evidence, expected, contentBox: CONTENT_BOX };
}

test("content box from template margins matches the PA-06 measured content area", () => {
  assert.ok(Math.abs(CONTENT_BOX.left - 51.02) < 0.01);
  assert.ok(Math.abs(CONTENT_BOX.right - 544.26) < 0.01);
  assert.ok(Math.abs(CONTENT_BOX.top - 785.2) < 0.01);
  assert.ok(Math.abs(CONTENT_BOX.bottom - 56.69) < 0.01);
});

test("p0-page-size: A4 within 1pt passes, oversized page flagged with drift", () => {
  assert.equal(p0PageSizeRule.check(makeInput(makeEvidence({}))).length, 0);
  const wrong = makeEvidence({
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 700, 841.89],
        widthPt: 700,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
  });
  const findings = p0PageSizeRule.check(makeInput(wrong));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.code, "P0_PAGE_SIZE");
  assert.equal(findings[0]?.pageIndex, 0);
  assert.equal(findings[0]?.nodeRef, "page:0");
  assert.ok(
    Math.abs((findings[0]?.basis.metrics["widthDriftPt"] ?? 0) - 104.72) < 0.01,
  );
});

test("p0-bounds: inside run passes; edge-hugging run within tolerance passes", () => {
  const inside = makeRun({
    x: CONTENT_BOX.left,
    y: CONTENT_BOX.top,
    width: 10,
    height: 12,
  });
  const hugging = makeRun({
    x: CONTENT_BOX.right - 10 + 0.4,
    y: CONTENT_BOX.bottom + 12 - 0.4,
    width: 10,
    height: 12,
  });
  assert.equal(
    p0BoundsRule.check(makeInput(makeEvidence({ textRuns: [inside, hugging] }))).length,
    0,
  );
});

test("p0-bounds: run beyond content box but inside page is flagged with amount", () => {
  const run = makeRun({ x: CONTENT_BOX.right - 10 + 3, width: 10 });
  const findings = p0BoundsRule.check(makeInput(makeEvidence({ textRuns: [run] })));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.code, "P0_OUT_OF_BOUNDS");
  assert.ok(
    Math.abs((findings[0]?.basis.metrics["beyondContentBoxPt"] ?? 0) - 3) < 0.001,
  );
  assert.equal(findings[0]?.basis.metrics["beyondPagePt"], 0);
  assert.equal(findings[0]?.nodeRef, `run:${run.readingOrder}`);
});

test("p0-bounds: figure beyond page edge is flagged", () => {
  const evidence = makeEvidence({
    figures: [
      makeFigure({
        bbox: { x: 500, y: 800, width: 120, height: 100 },
        paintBBox: { x: 500, y: 800, width: 120, height: 100 },
      }),
    ],
  });
  const findings = p0BoundsRule.check(makeInput(evidence));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.nodeRef, "figure:0:0");
  assert.ok((findings[0]?.basis.metrics["beyondPagePt"] ?? 0) > 0);
});

test("p0-overlap: same-line kerning-scale overlap is exempt", () => {
  const a = makeRun({ x: 100, width: 10, blockOrder: 3, baselineY: 700 });
  const b = makeRun({ x: 109.7, width: 10, blockOrder: 3, baselineY: 700 });
  assert.equal(
    p0OverlapRule.check(makeInput(makeEvidence({ textRuns: [a, b] }))).length,
    0,
  );
});

test("p0-overlap: same-line overlap beyond 0.6em is flagged", () => {
  const a = makeRun({ x: 100, width: 10, fontSize: 12, blockOrder: 3, baselineY: 700 });
  const b = makeRun({ x: 102, width: 10, fontSize: 12, blockOrder: 3, baselineY: 700 });
  const findings = p0OverlapRule.check(makeInput(makeEvidence({ textRuns: [a, b] })));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.code, "P0_OVERLAP");
  assert.equal(findings[0]?.basis.relatedNodeRef, `run:${b.readingOrder}`);
});

test("p0-overlap: cross-line collision is flagged; touching boxes pass", () => {
  const a = makeRun({ x: 100, y: 700, height: 12, blockOrder: 3, baselineY: 690 });
  const b = makeRun({ x: 105, y: 705, height: 12, blockOrder: 4, baselineY: 695 });
  const findings = p0OverlapRule.check(makeInput(makeEvidence({ textRuns: [a, b] })));
  assert.equal(findings.length, 1);
  const c = makeRun({ x: 200, width: 10, blockOrder: 5, baselineY: 690 });
  const d = makeRun({ x: 210, width: 10, blockOrder: 6, baselineY: 650 });
  assert.equal(
    p0OverlapRule.check(makeInput(makeEvidence({ textRuns: [c, d] }))).length,
    0,
  );
});

test("p0-overlap: figure member run exempt; geometric insider without membership flagged", () => {
  // 成员制（决策 #10）：figure bbox 为版心全域（clip 撑起），绘制框只是图表区。
  const figure = makeFigure({});
  // 图表标签：几何与结构双重在图内 → 成员豁免，与自身图/同图标签互叠不报。
  const labelA = makeRun({ x: 100, y: 700, width: 10, height: 12, figureMcid: 0 });
  const labelB = makeRun({ x: 105, y: 700, width: 10, height: 12, figureMcid: 0 });
  assert.equal(
    p0OverlapRule.check(
      makeInput(makeEvidence({ textRuns: [labelA, labelB], figures: [figure] })),
    ).length,
    0,
  );
  // 决定性（验收①③）：几何完全落入 paintBBox（不骑缝）但结构非成员 → P0。
  const covered = makeRun({ x: 100, y: 700, width: 10, height: 12 });
  const findings = p0OverlapRule.check(
    makeInput(makeEvidence({ textRuns: [covered], figures: [figure] })),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.code, "P0_OVERLAP");
  assert.equal(findings[0]?.nodeRef, `run:${covered.readingOrder}`);
  assert.equal(findings[0]?.basis.relatedNodeRef, "figure:0:0");
});

test("p0-overlap: run inside clip-inflated bbox but outside painted extent passes", () => {
  // 基线 p7/p9 形态：figure bbox 版心全域，正文 run 几何落入 bbox 但在
  // paintBBox 之外 → 无重叠，不误报（误报门）。
  const figure = makeFigure({});
  const body = makeRun({ x: 100, y: 500, width: 200, height: 12 });
  assert.equal(
    p0OverlapRule.check(
      makeInput(makeEvidence({ textRuns: [body], figures: [figure] })),
    ).length,
    0,
  );
});

test("p0-overlap: straddling painted extent flagged; member of another figure flagged", () => {
  const figure = makeFigure({});
  // 骑缝 paintBBox 边缘的非成员 run → P0。
  const straddle = makeRun({ x: 82, y: 700, width: 20, height: 12 });
  const findings = p0OverlapRule.check(
    makeInput(makeEvidence({ textRuns: [straddle], figures: [figure] })),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.basis.relatedNodeRef, "figure:0:0");
  // 属于另一 figure 的成员与本图重叠 → 不享受本图豁免。
  const other = makeFigure({
    mcid: 1,
    paintBBox: { x: 600, y: 100, width: 10, height: 10 },
  });
  const alien = makeRun({ x: 100, y: 700, width: 10, height: 12, figureMcid: 1 });
  const alienFindings = p0OverlapRule.check(
    makeInput(makeEvidence({ textRuns: [alien], figures: [figure, other] })),
  );
  assert.equal(alienFindings.length, 1);
  assert.equal(alienFindings[0]?.basis.relatedNodeRef, "figure:0:0");
});

test("p0-content: present blocks pass; missing block flagged with ref and length", () => {
  const runs = [makeRun({ text: "标题" }), makeRun({ text: "第一段正文" })];
  const expected = [
    { ref: "/title", text: "标题", repeatable: false },
    { ref: "/blocks/0", text: "第一段正文", repeatable: false },
  ];
  assert.equal(
    p0ContentRule.check(makeInput(makeEvidence({ textRuns: runs }), expected)).length,
    0,
  );
  const missing = [
    ...expected,
    { ref: "/blocks/1", text: "被删掉的段落", repeatable: false },
  ];
  const findings = p0ContentRule.check(
    makeInput(makeEvidence({ textRuns: runs }), missing),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.code, "P0_CONTENT_MISSING");
  assert.equal(findings[0]?.nodeRef, "/blocks/1");
  assert.equal(findings[0]?.basis.metrics["expectedLength"], 6);
});

test("p0-content: reordered block is not a missing-content false positive", () => {
  const runs = [makeRun({ text: "乙块" }), makeRun({ text: "甲块" })];
  const expected = [
    { ref: "/blocks/0", text: "甲块", repeatable: false },
    { ref: "/blocks/1", text: "乙块", repeatable: false },
  ];
  assert.equal(
    p0ContentRule.check(makeInput(makeEvidence({ textRuns: runs }), expected)).length,
    0,
  );
});

test("p0-content: repeatable header accepts any single occurrence", () => {
  const runs = [makeRun({ text: "表头列" }), makeRun({ text: "数据行" })];
  const expected = [
    { ref: "/blocks/2/header-group", text: "表头列", repeatable: true },
  ];
  assert.equal(
    p0ContentRule.check(makeInput(makeEvidence({ textRuns: runs }), expected)).length,
    0,
  );
  const absent = p0ContentRule.check(
    makeInput(makeEvidence({ textRuns: [makeRun({ text: "数据行" })] }), expected),
  );
  assert.equal(absent.length, 1);
});

test("buildExpectedBlocks walks document blocks with stable refs", () => {
  const document = {
    schemaVersion: "0.1.0",
    documentId: "doc_" + "0".repeat(32),
    revision: 0,
    title: "测试标题",
    language: "zh-CN",
    blocks: [
      {
        type: "section",
        level: 1,
        title: "章节一",
        children: [{ type: "paragraph", text: "段落正文" }],
      },
      { type: "list", ordered: true, items: [{ text: "第一项" }, { text: "第二项" }] },
      {
        type: "table",
        columns: [{ header: "列甲" }, { header: "列乙" }],
        rows: [{ cells: [{ text: "甲1" }, { text: "乙1" }] }],
      },
      { type: "figure", src: "assets/x.svg", altText: "图注", kind: "chart" },
    ],
    assets: [],
  } as unknown as WenshuDocument;
  const blocks = buildExpectedBlocks(document, ["图内文字"]);
  const refs = blocks.map(
    (block) => `${block.ref}:${block.text}${block.repeatable ? "*" : ""}`,
  );
  assert.deepEqual(refs, [
    "/title:测试标题",
    "/blocks/0:章节一",
    "/blocks/0/children/0:段落正文",
    "/blocks/1/items/0/marker:1.",
    "/blocks/1/items/0:第一项",
    "/blocks/1/items/1/marker:2.",
    "/blocks/1/items/1:第二项",
    "/blocks/2/columns/0/header:列甲",
    "/blocks/2/columns/1/header:列乙",
    "/blocks/2/header-group:列甲列乙*",
    "/blocks/2/rows/0/cells/0:甲1",
    "/blocks/2/rows/0/cells/1:乙1",
    "/blocks/3/svg:图内文字",
    "/blocks/3/caption:图注",
  ]);
});

test("runner: unknown disabled rule id fails closed", () => {
  assert.throws(
    () =>
      runP0Checks(makeInput(makeEvidence({})), {
        disabledRules: ["p9-nope" as never],
      }),
    (error: unknown) =>
      error instanceof ReportChecksError && error.code === "REPORT_CHECKS_UNKNOWN_RULE",
  );
});

test("runner: legacy 1.0.0 evidence fails closed (no membership facts)", () => {
  const legacy = {
    ...makeEvidence({}),
    evidenceVersion: "1.0.0",
  } as unknown as WenshuPdfEvidence;
  assert.throws(
    () => runP0Checks(makeInput(legacy)),
    (error: unknown) =>
      error instanceof ReportChecksError &&
      error.code === "REPORT_CHECKS_UNSUPPORTED_EVIDENCE",
  );
});

test("runner: disabling one rule suppresses only its findings", () => {
  const evidence = makeEvidence({
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 700, 841.89],
        widthPt: 700,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
    textRuns: [makeRun({ x: 690, width: 20 })],
  });
  const full = runP0Checks(makeInput(evidence));
  const codes = new Set(full.findings.map((finding) => finding.ruleId));
  assert.ok(codes.has("p0-page-size") && codes.has("p0-bounds"));
  const rolledBack = runP0Checks(makeInput(evidence), { disabledRules: ["p0-bounds"] });
  assert.deepEqual(
    new Set(rolledBack.findings.map((finding) => finding.ruleId)),
    new Set(["p0-page-size"]),
  );
  assert.deepEqual(rolledBack.rules, ["p0-page-size", "p0-overlap", "p0-content"]);
});

test("runner: deterministic output for identical input", () => {
  const evidence = makeEvidence({
    textRuns: [
      makeRun({ x: 100, width: 10, blockOrder: 3, baselineY: 700 }),
      makeRun({ x: 102, width: 10, blockOrder: 4, baselineY: 690 }),
    ],
  });
  const first = runP0Checks(makeInput(evidence));
  const second = runP0Checks(makeInput(evidence));
  assert.deepEqual(first, second);
});
