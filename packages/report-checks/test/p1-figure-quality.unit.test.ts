/**
 * P1 图片质量规则单元测试（PA-10，从 p1-figures.unit.test.ts 按文件体量门
 * 拆出）：比例失真/容差边界/viewBox 缺失 fail-closed、内容忠实对账
 * （转换红线）、字体嵌入、诚实门（legibility 只产人工项）、源 SVG
 * viewBox 白名单解析。helper 与 p1-figures.unit.test.ts 同源复制
 * （测试内聚优先于去重）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";
import type { PaginationRules } from "@wenshu/template-model";

import type { ExpectedBlock } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import type { P1CheckInput } from "../src/p1-input.ts";
import {
  p1FigureAspectRule,
  FIGURE_ASPECT_TOLERANCE,
} from "../src/rules/p1-figure-aspect.ts";
import { p1FigureFidelityRule } from "../src/rules/p1-figure-fidelity.ts";
import { p1FigureLegibilityRule } from "../src/rules/p1-figure-legibility.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

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
test("p1-figure-aspect: distortion beyond tolerance is detected with milli metrics", () => {
  const result = p1FigureAspectRule.check(
    makeInput(makeEvidence({ aspect: 2.3 }), expectedWith({})),
  );
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0];
  assert.equal(finding?.code, "P1_FIGURE_ASPECT_DISTORTED");
  assert.equal(finding?.pageIndex, 0);
  assert.equal(finding?.nodeRef, "figure:0:0");
  assert.equal(finding?.basis.metrics["paintAspectMilli"], 2300);
  assert.equal(finding?.basis.metrics["sourceAspectMilli"], 2000);
  assert.equal(
    finding?.basis.metrics["toleranceMilli"],
    FIGURE_ASPECT_TOLERANCE * 1000,
  );
});

test("p1-figure-aspect: deviation inside tolerance is legal, not reported", () => {
  // 偏差 0.004 < 容差 0.01：贴容差合法不报。
  const result = p1FigureAspectRule.check(
    makeInput(makeEvidence({ aspect: 2.004 }), expectedWith({})),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 0);
});

test("p1-figure-aspect: missing viewBox degrades to review, never a finding", () => {
  const result = p1FigureAspectRule.check(
    makeInput(makeEvidence({}), expectedWith({ aspect: null })),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.equal(result.manualChecks[0]?.code, "P1_FIGURE_ASPECT_REVIEW");
});

test("p1-figure-fidelity: altered legend text is detected (conversion red line)", () => {
  const result = p1FigureFidelityRule.check(
    makeInput(
      makeEvidence({
        runs: [
          run({ readingOrder: 0, text: "甲", figureMcid: 0 }),
          run({ readingOrder: 1, text: "丙", figureMcid: 0 }),
          run({ readingOrder: 2, text: "图 1　甲图", blockOrder: 2 }),
          run({ readingOrder: 3, text: "图 1 来源：测试", blockOrder: 3 }),
        ],
      }),
      expectedWith({}),
    ),
  );
  assert.equal(result.findings.length, 1);
  const finding = result.findings[0];
  assert.equal(finding?.code, "P1_FIGURE_CONTENT_MISMATCH");
  assert.equal(finding?.nodeRef, "figure:0:0");
  assert.equal(finding?.basis.metrics["expectedLength"], 2);
  assert.equal(finding?.basis.metrics["actualLength"], 2);
});

test("p1-figure-fidelity: rasterized figure (no member runs) cannot pass silently", () => {
  const result = p1FigureFidelityRule.check(
    makeInput(
      makeEvidence({
        runs: [
          run({ readingOrder: 0, text: "图 1　甲图", blockOrder: 2 }),
          run({ readingOrder: 1, text: "图 1 来源：测试", blockOrder: 3 }),
        ],
      }),
      expectedWith({}),
    ),
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_FIGURE_CONTENT_MISMATCH");
  assert.equal(result.findings[0]?.basis.metrics["memberRunCount"], 0);
});

test("p1-figure-fidelity: non-embedded member font is detected", () => {
  const result = p1FigureFidelityRule.check(
    makeInput(
      makeEvidence({
        runs: [
          run({
            readingOrder: 0,
            text: "甲",
            figureMcid: 0,
            font: { ...FONT, embedded: false },
          }),
          run({ readingOrder: 1, text: "乙", figureMcid: 0 }),
          run({ readingOrder: 2, text: "图 1　甲图", blockOrder: 2 }),
          run({ readingOrder: 3, text: "图 1 来源：测试", blockOrder: 3 }),
        ],
      }),
      expectedWith({}),
    ),
  );
  assert.deepEqual(
    result.findings.map((finding) => finding.code),
    ["P1_FIGURE_FONT_NOT_EMBEDDED"],
  );
  assert.equal(result.findings[0]?.basis.metrics["notEmbeddedCount"], 1);
});

test("p1-figure-legibility: emits manual review only, never findings (honest gate)", () => {
  const result = p1FigureLegibilityRule.check(
    makeInput(makeEvidence({ aspect: 2.3 }), expectedWith({})),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.equal(result.manualChecks[0]?.code, "P1_FIGURE_LEGIBILITY_REVIEW");
});

test("extractSvgAspectRatio: whitelist parsing, fail-closed on invalid input", () => {
  assert.equal(
    extractSvgAspectRatio('<svg viewBox="0 0 1200 680">x</svg>'),
    1200 / 680,
  );
  assert.equal(
    extractSvgAspectRatio('<svg width="10" viewBox="10 20 100 50">x</svg>'),
    2,
  );
  assert.equal(
    extractSvgAspectRatio('<svg viewBox="0 0 1200,680">x</svg>'),
    1200 / 680,
  );
  assert.equal(extractSvgAspectRatio("<svg>x</svg>"), null);
  assert.equal(extractSvgAspectRatio('<svg viewBox="0 0 0 680">x</svg>'), null);
  assert.equal(extractSvgAspectRatio('<svg viewBox="0 0 1200">x</svg>'), null);
  assert.equal(extractSvgAspectRatio('<svg viewBox="a b c d">x</svg>'), null);
  assert.equal(extractSvgAspectRatio("not svg at all"), null);
});
