/**
 * P1 图片域规则单元测试（PA-10）：合成证据构造题注/来源归属全对抗面——
 * 正常、越页孤立、次序颠倒、未紧随、归属歧义 fail-closed、跨 MCID 块、
 * 模板门静默跳过。比例/忠实/清晰度/viewBox 解析见
 * p1-figure-quality.unit.test.ts（文件体量门拆分）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";
import type { PaginationRules } from "@wenshu/template-model";

import type { ExpectedBlock } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import type { P1CheckInput } from "../src/p1-input.ts";
import { p1FigureAspectRule } from "../src/rules/p1-figure-aspect.ts";
import { p1FigureCaptionRule } from "../src/rules/p1-figure-caption.ts";
import { p1FigureFidelityRule } from "../src/rules/p1-figure-fidelity.ts";
import { p1FigureLegibilityRule } from "../src/rules/p1-figure-legibility.ts";
import { p1FigureSourceRule } from "../src/rules/p1-figure-source.ts";

const SHA = "b".repeat(64);
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
const PAGINATION: PaginationRules = {
  cover_own_page: true,
  toc_start_new_page: true,
  h1_start_new_page: true,
  heading_keep_with_next_lines: 2,
  widows: 2,
  orphans: 2,
  table_repeat_header: true,
  table_row_break_inside: "avoid",
  figure_keep_with_caption: true,
  max_consecutive_sparse_pages: 1,
};

function run(over: Partial<TextRun> & { readingOrder: number }): TextRun {
  return {
    pageIndex: 0,
    text: "字",
    bbox: { x: 60, y: 590, width: 10, height: 12 },
    baselineY: 580,
    fontSize: 9,
    font: FONT,
    blockOrder: 1,
    viaActualText: false,
    figureMcid: null,
    ...over,
  };
}

/** 基件：页 0 一图（paint 200x100 比 2.0，底边 y=600）+ 成员 2 run + 题注 + 来源。 */
function makeEvidence(over: {
  runs?: TextRun[];
  aspect?: number;
  pageCount?: number;
}): WenshuPdfEvidence {
  const aspect = over.aspect ?? 2;
  const pageCount = over.pageCount ?? 2;
  const paintWidth = 200;
  const paintHeight = paintWidth / aspect;
  const figure = {
    pageIndex: 0,
    mcid: 0,
    bbox: { x: 50, y: 760, width: 495, height: 700 },
    paintBBox: { x: 100, y: 600 + paintHeight, width: paintWidth, height: paintHeight },
    kind: "vector-figure" as const,
    altShort: "图 1　甲图",
    altLong: null,
  };
  const members = [
    run({
      readingOrder: 0,
      text: "甲",
      figureMcid: 0,
      bbox: { x: 110, y: 690, width: 10, height: 10 },
    }),
    run({
      readingOrder: 1,
      text: "乙",
      figureMcid: 0,
      bbox: { x: 130, y: 690, width: 10, height: 10 },
    }),
  ];
  const caption = [
    run({
      readingOrder: 2,
      text: "图 1　甲图",
      blockOrder: 2,
      bbox: { x: 100, y: 590, width: 60, height: 12 },
    }),
  ];
  const source = [
    run({
      readingOrder: 3,
      text: "图 1 来源：测试",
      blockOrder: 3,
      bbox: { x: 100, y: 570, width: 80, height: 12 },
    }),
  ];
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    index,
    mediaBox: [0, 0, 595.28, 841.89],
    widthPt: 595.28,
    heightPt: 841.89,
    rotate: 0 as const,
  }));
  return {
    evidenceVersion: "1.1.0",
    source: { sha256: SHA, pageCount, producer: "Skia/PDF m150" },
    pages,
    textRuns: over.runs ?? [...members, ...caption, ...source],
    figures: [figure],
    fonts: [{ name: "A+TestSans", ...FONT, subtype: "Type3" }],
  };
}

function feb(
  ref: string,
  text: string,
  kind: ExpectedBlock["kind"],
  figureOrdinal: number,
  figureAspect?: number | null,
): ExpectedBlock {
  return Object.freeze({
    ref,
    // ExpectedBlock.text 契约为归一文本（production 由 buildExpectedBlocks 归一）。
    text: normalizePdfText(text),
    repeatable: false,
    kind,
    figureOrdinal,
    ...(figureAspect === undefined ? {} : { figureAspect }),
  });
}

function expectedWith(over: {
  caption?: string | null;
  source?: string | null;
  aspect?: number | null;
  svg?: string | null;
}): ExpectedBlock[] {
  const out: ExpectedBlock[] = [];
  if (over.svg !== null) {
    // aspect 显式 null = 源侧无 viewBox（fail-closed 路径）；undefined = 默认 2。
    const aspect = over.aspect === undefined ? 2 : over.aspect;
    out.push(feb("/blocks/0/svg", over.svg ?? "甲乙", "figure-svg", 0, aspect));
  }
  if (over.caption !== null) {
    out.push(feb("/blocks/0/caption", over.caption ?? "图1甲图", "figure-caption", 0));
  }
  if (over.source !== null) {
    out.push(feb("/blocks/1", over.source ?? "图1来源：测试", "figure-source", 0));
  }
  return out;
}

function makeInput(
  evidence: WenshuPdfEvidence,
  expected: readonly ExpectedBlock[],
  paginationRules: PaginationRules = PAGINATION,
): P1CheckInput {
  return { evidence, expected, contentBox: CONTENT_BOX, paginationRules };
}

const RULES = [
  p1FigureCaptionRule,
  p1FigureSourceRule,
  p1FigureAspectRule,
  p1FigureFidelityRule,
  p1FigureLegibilityRule,
] as const;

function runAll(input: P1CheckInput) {
  const findings = [];
  const manualChecks = [];
  for (const rule of RULES) {
    const result = rule.check(input);
    findings.push(...result.findings);
    manualChecks.push(...result.manualChecks);
  }
  return { findings, manualChecks };
}

test("figure rules: well-formed figure yields zero findings; only legibility review", () => {
  const { findings, manualChecks } = runAll(
    makeInput(makeEvidence({}), expectedWith({})),
  );
  assert.deepEqual(findings, []);
  assert.deepEqual(
    manualChecks.map((manual) => manual.code),
    ["P1_FIGURE_LEGIBILITY_REVIEW"],
  );
  const review = manualChecks[0];
  assert.equal(review?.nodeRef, "figure:0:0");
  assert.equal(review?.basis.metrics["memberRunCount"], 2);
  assert.equal(review?.basis.metrics["minMemberFontSizePt"], 9);
});

test("p1-figure-caption: caption isolated to next page is detected and located", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({ readingOrder: 2, text: "图 1　甲图", pageIndex: 1, blockOrder: 2 }),
      run({ readingOrder: 3, text: "图 1 来源：测试", blockOrder: 3 }),
    ],
  });
  const result = p1FigureCaptionRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0];
  assert.equal(finding?.code, "P1_FIGURE_CAPTION_SEPARATED");
  assert.equal(finding?.pageIndex, 1);
  assert.equal(finding?.nodeRef, "figure:0:0");
  assert.equal(finding?.basis.relatedNodeRef, "run:2");
  assert.equal(finding?.basis.metrics["figurePage"], 0);
  assert.equal(finding?.basis.metrics["captionPage"], 1);
  assert.equal(finding?.basis.metrics["templateFigureKeepWithCaption"], 1);
  assert.equal(result.manualChecks.length, 0);
});

test("p1-figure-caption: duplicated caption text degrades to review, never a finding", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({ readingOrder: 2, text: "图 1　甲图", blockOrder: 2 }),
      run({
        readingOrder: 3,
        text: "图 1　甲图",
        blockOrder: 3,
        bbox: { x: 100, y: 570, width: 60, height: 12 },
      }),
      run({
        readingOrder: 4,
        text: "图 1 来源：测试",
        blockOrder: 4,
        bbox: { x: 100, y: 550, width: 80, height: 12 },
      }),
    ],
  });
  const result = p1FigureCaptionRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.equal(result.manualChecks[0]?.code, "P1_FIGURE_CAPTION_REVIEW");
});

test("p1-figure-caption: caption above the figure (odd layout) degrades to review", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      // 题注顶边 y=720 高于 paint 底边 600+容差 → 异版式不自动判。
      run({
        readingOrder: 2,
        text: "图 1　甲图",
        blockOrder: 2,
        bbox: { x: 100, y: 720, width: 60, height: 12 },
      }),
      run({ readingOrder: 3, text: "图 1 来源：测试", blockOrder: 3 }),
    ],
  });
  const result = p1FigureCaptionRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.equal(result.manualChecks[0]?.code, "P1_FIGURE_CAPTION_REVIEW");
});

test("p1-figure-caption: caption split across two MCID blocks degrades to review", () => {
  // 文本对齐但块序防线未过（题注不是一个 DOM 块）：fail-closed 不自动判。
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({ readingOrder: 2, text: "图 1　甲", blockOrder: 2 }),
      run({ readingOrder: 3, text: "图", blockOrder: 3 }),
      run({
        readingOrder: 4,
        text: "图 1 来源：测试",
        blockOrder: 4,
        bbox: { x: 100, y: 550, width: 80, height: 12 },
      }),
    ],
  });
  const result = p1FigureCaptionRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.equal(result.manualChecks[0]?.code, "P1_FIGURE_CAPTION_REVIEW");
});

test("p1-figure-caption: absent caption degrades to review (existence is P0 domain)", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({ readingOrder: 2, text: "图 1 来源：测试", blockOrder: 3 }),
    ],
  });
  const result = p1FigureCaptionRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.equal(result.manualChecks[0]?.code, "P1_FIGURE_CAPTION_REVIEW");
});

test("p1-figure-caption: template gate off skips the rule silently", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({ readingOrder: 2, text: "图 1　甲图", pageIndex: 1, blockOrder: 2 }),
      run({ readingOrder: 3, text: "图 1 来源：测试", blockOrder: 3 }),
    ],
  });
  const result = p1FigureCaptionRule.check(
    makeInput(evidence, expectedWith({}), {
      ...PAGINATION,
      figure_keep_with_caption: false,
    }),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 0);
});

test("p1-figure-source: source isolated to next page is detected and located", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({ readingOrder: 2, text: "图 1　甲图", blockOrder: 2 }),
      run({ readingOrder: 3, text: "图 1 来源：测试", pageIndex: 1, blockOrder: 3 }),
    ],
  });
  const result = p1FigureSourceRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0];
  assert.equal(finding?.code, "P1_FIGURE_SOURCE_SEPARATED");
  assert.equal(finding?.basis.metrics["sourcePage"], 1);
  assert.equal(finding?.basis.metrics["figurePage"], 0);
  assert.equal(finding?.basis.relatedNodeRef, "run:3");
});

test("p1-figure-source: source before the caption (order reversed) is detected", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({
        readingOrder: 2,
        text: "图 1 来源：测试",
        blockOrder: 2,
        bbox: { x: 100, y: 590, width: 80, height: 12 },
      }),
      run({
        readingOrder: 3,
        text: "图 1　甲图",
        blockOrder: 3,
        bbox: { x: 100, y: 570, width: 60, height: 12 },
      }),
    ],
  });
  const result = p1FigureSourceRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_FIGURE_SOURCE_SEPARATED");
  assert.equal(result.findings[0]?.basis.metrics["orderViolation"], 1);
});

test("p1-figure-source: content between caption and source (not adjacent) is detected", () => {
  const evidence = makeEvidence({
    runs: [
      run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
      run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
      run({ readingOrder: 2, text: "图 1　甲图", blockOrder: 2 }),
      run({
        readingOrder: 3,
        text: "插",
        blockOrder: 9,
        bbox: { x: 100, y: 580, width: 10, height: 12 },
      }),
      run({ readingOrder: 4, text: "图 1 来源：测试", blockOrder: 3 }),
    ],
  });
  const result = p1FigureSourceRule.check(makeInput(evidence, expectedWith({})));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_FIGURE_SOURCE_SEPARATED");
  assert.equal(result.findings[0]?.basis.metrics["gapRunsAfterCaption"], 1);
});

test("p1-figure-source: undeclared or absent source degrades to review", () => {
  const undeclared = p1FigureSourceRule.check(
    makeInput(makeEvidence({}), expectedWith({ source: null })),
  );
  assert.equal(undeclared.findings.length, 0);
  assert.equal(undeclared.manualChecks.length, 1);
  assert.equal(undeclared.manualChecks[0]?.code, "P1_FIGURE_SOURCE_REVIEW");
  assert.equal(undeclared.manualChecks[0]?.basis.metrics["sourceDeclared"], 0);

  const absent = p1FigureSourceRule.check(
    makeInput(
      makeEvidence({
        runs: [
          run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
          run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
          run({ readingOrder: 2, text: "图 1　甲图", blockOrder: 2 }),
        ],
      }),
      expectedWith({}),
    ),
  );
  assert.equal(absent.findings.length, 0);
  assert.equal(absent.manualChecks.length, 1);
  assert.equal(absent.manualChecks[0]?.basis.metrics["sourceDeclared"], 1);
});
