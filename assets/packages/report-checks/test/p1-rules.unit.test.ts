/**
 * P1 规则与归属单元测试（PA-08）：合成证据（纯函数层，不触文件系统）。
 * 覆盖：反向游标归属（同文取较晚出现）、baseline 聚行、标题分离自动
 * 判定与灰区降人工、孤行/寡行贴边合法、空页二值判定、密度证据。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import type { PaginationRules } from "@wenshu/template-model";

import type { ExpectedBlock, ExpectedBlockKind } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import {
  attributeBlocks,
  countLines,
  LINE_BASELINE_TOLERANCE_PT,
  pagesOfBlock,
} from "../src/p1-attribution.ts";
import type { P1CheckInput } from "../src/p1-input.ts";
import { p1HeadingKeepRule } from "../src/rules/p1-heading-keep.ts";
import { p1OrphanRule } from "../src/rules/p1-orphan.ts";
import { p1SparsePageRule } from "../src/rules/p1-sparse-page.ts";
import { p1WidowRule } from "../src/rules/p1-widow.ts";

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

let runSeq = 0;
function makeRun(over: {
  pageIndex?: number;
  text?: string;
  baselineY?: number;
  blockOrder?: number;
  figureMcid?: number | null;
  width?: number;
  height?: number;
}): WenshuPdfEvidence["textRuns"][number] {
  runSeq += 1;
  return {
    pageIndex: over.pageIndex ?? 0,
    text: over.text ?? "字",
    bbox: {
      x: 60,
      y: (over.baselineY ?? 780) + 10,
      width: over.width ?? 10,
      height: over.height ?? 12,
    },
    baselineY: over.baselineY ?? 780,
    fontSize: 12,
    font: FONT,
    blockOrder: over.blockOrder ?? 1,
    readingOrder: runSeq - 1,
    viaActualText: false,
    figureMcid: over.figureMcid ?? null,
  };
}

function makeEvidence(
  over: Partial<WenshuPdfEvidence>,
  pageCount = 2,
): WenshuPdfEvidence {
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
    textRuns: [],
    figures: [],
    fonts: [{ name: "A+TestSans", ...FONT, subtype: "Type3" }],
    ...over,
  };
}

function eb(
  ref: string,
  text: string,
  kind: ExpectedBlockKind,
  repeatable = false,
): ExpectedBlock {
  return Object.freeze({ ref, text, repeatable, kind });
}

function makeInput(
  evidence: WenshuPdfEvidence,
  expected: readonly ExpectedBlock[],
): P1CheckInput {
  return { evidence, expected, contentBox: CONTENT_BOX, paginationRules: PAGINATION };
}

test("attribution: duplicate title text resolves to the later (real) occurrence", () => {
  const runs = [
    makeRun({ pageIndex: 0, text: "标题" }),
    makeRun({ pageIndex: 1, text: "标题" }),
    makeRun({ pageIndex: 1, text: "正文段落" }),
  ];
  const expected = [
    eb("/title", "标题", "cover-title"),
    eb("/blocks/0", "标题", "section-title"),
    eb("/blocks/0/children/0", "正文段落", "paragraph"),
  ];
  const attribution = attributeBlocks(makeEvidence({ textRuns: runs }), expected);
  const cover = attribution.matched.find((entry) => entry.block.kind === "cover-title");
  const heading = attribution.matched.find(
    (entry) => entry.block.kind === "section-title",
  );
  assert.deepEqual(cover?.runIndexes, [0]);
  assert.deepEqual(heading?.runIndexes, [1]);
  assert.deepEqual(attribution.unmatchedRefs, []);
});

test("attribution: missing block is skipped and listed (P0 domain, not P1)", () => {
  const runs = [makeRun({ text: "存在的块" })];
  const expected = [
    eb("/blocks/0", "存在的块", "paragraph"),
    eb("/blocks/1", "被删的块", "paragraph"),
  ];
  const attribution = attributeBlocks(makeEvidence({ textRuns: runs }), expected);
  assert.equal(attribution.matched.length, 1);
  assert.deepEqual(attribution.unmatchedRefs, ["/blocks/1"]);
});

test("countLines clusters baselines within the shared 2pt tolerance", () => {
  assert.equal(LINE_BASELINE_TOLERANCE_PT, 2);
  const runs = [
    makeRun({ baselineY: 700 }),
    makeRun({ baselineY: 701.9 }),
    makeRun({ baselineY: 690 }),
  ];
  const attribution = attributeBlocks(makeEvidence({ textRuns: runs }), [
    eb("/blocks/0", "字字字", "paragraph"),
  ]);
  assert.equal(countLines(attribution, [0, 1, 2]), 2);
});

test("p1-heading-keep: heading with zero following lines on its page is flagged", () => {
  const runs = [
    makeRun({ pageIndex: 0, text: "章一", baselineY: 800 }),
    makeRun({ pageIndex: 1, text: "正文一", baselineY: 800 }),
    makeRun({ pageIndex: 1, text: "正文二", baselineY: 786 }),
  ];
  const expected = [
    eb("/blocks/0", "章一", "section-title"),
    eb("/blocks/0/children/0", "正文一正文二", "paragraph"),
  ];
  const result = p1HeadingKeepRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_HEADING_SEPARATED");
  assert.equal(result.findings[0]?.pageIndex, 0);
  assert.equal(result.findings[0]?.nodeRef, "/blocks/0");
  assert.equal(result.findings[0]?.basis.relatedNodeRef, "/blocks/0/children/0");
  assert.deepEqual(result.findings[0]?.basis.metrics, {
    followingLinesOnPage: 0,
    templateKeepWithNextLines: 2,
  });
  assert.equal(result.manualChecks.length, 0);
});

test("p1-heading-keep: 1..N-1 following lines degrade to manual review, never a finding", () => {
  const runs = [
    makeRun({ pageIndex: 0, text: "章一", baselineY: 800 }),
    makeRun({ pageIndex: 0, text: "唯一行", baselineY: 786 }),
  ];
  const expected = [
    eb("/blocks/0", "章一", "section-title"),
    eb("/blocks/0/children/0", "唯一行", "paragraph"),
  ];
  const result = p1HeadingKeepRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  const review = result.manualChecks[0];
  assert.equal(review?.code, "P1_HEADING_KEEP_REVIEW");
  assert.equal(review?.pageIndex, 0);
  assert.equal(review?.nodeRef, "/blocks/0");
  assert.deepEqual(review?.basis.metrics, {
    followingLinesOnPage: 1,
    templateKeepWithNextLines: 2,
  });
});

test("p1-heading-keep: exactly keepN following lines passes silently", () => {
  const runs = [
    makeRun({ pageIndex: 0, text: "章一", baselineY: 800 }),
    makeRun({ pageIndex: 0, text: "第一行", baselineY: 786 }),
    makeRun({ pageIndex: 0, text: "第二行", baselineY: 772 }),
  ];
  const expected = [
    eb("/blocks/0", "章一", "section-title"),
    eb("/blocks/0/children/0", "第一行第二行", "paragraph"),
  ];
  const result = p1HeadingKeepRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 0);
});

test("p1-heading-keep: heading before a table is skipped (PA-09 domain)", () => {
  const runs = [makeRun({ pageIndex: 0, text: "表题", baselineY: 800 })];
  const expected = [
    eb("/blocks/0", "表题", "section-title"),
    eb("/blocks/1/columns/0/header", "列表头", "table-header"),
  ];
  const result = p1HeadingKeepRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 0);
});

test("p1-heading-keep: ordered-list marker merges with its item first line", () => {
  const runs = [
    makeRun({ pageIndex: 0, text: "章一", baselineY: 800 }),
    makeRun({ pageIndex: 0, text: "1.", baselineY: 786 }),
    makeRun({ pageIndex: 0, text: "首行", baselineY: 786 }),
    makeRun({ pageIndex: 0, text: "次行", baselineY: 772 }),
  ];
  const expected = [
    eb("/blocks/0", "章一", "section-title"),
    eb("/blocks/0/children/0/items/0/marker", "1.", "list-marker"),
    eb("/blocks/0/children/0/items/0", "首行次行", "list-item"),
  ];
  const result = p1HeadingKeepRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 0);
});

function splitParagraphRuns(): {
  runs: WenshuPdfEvidence["textRuns"];
  expected: ExpectedBlock[];
} {
  const runs = [
    makeRun({ pageIndex: 0, text: "一", baselineY: 800 }),
    makeRun({ pageIndex: 0, text: "二", baselineY: 786 }),
    makeRun({ pageIndex: 0, text: "三", baselineY: 772 }),
    makeRun({ pageIndex: 0, text: "四", baselineY: 758 }),
  ];
  const expected = [eb("/blocks/0", "一二三四", "paragraph")];
  return { runs, expected };
}

/** 把指定下标的 run 移到目标页（fault 注入辅助，禁非空断言）。 */
function moveTo(
  runs: WenshuPdfEvidence["textRuns"],
  pageIndex: number,
  ...indexes: readonly number[]
): void {
  for (const index of indexes) {
    const run = runs[index];
    assert.ok(run !== undefined, `run ${index} must exist`);
    run.pageIndex = pageIndex;
  }
}

test("p1-orphan: one line left at the page end is flagged with metrics", () => {
  const { runs, expected } = splitParagraphRuns();
  // 首行留页尾，其余三行去下页 → 寡行（1 < orphans=2）；页首 3 行不孤。
  moveTo(runs, 1, 1, 2, 3);
  const result = p1OrphanRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_ORPHAN");
  assert.equal(result.findings[0]?.pageIndex, 0);
  assert.equal(result.findings[0]?.nodeRef, "/blocks/0");
  assert.deepEqual(result.findings[0]?.basis.metrics, {
    linesAtPageEnd: 1,
    templateOrphans: 2,
    blockTotalLines: 4,
  });
  const widow = p1WidowRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(widow.findings.length, 0);
});

test("p1-widow: one line carried to the next page top is flagged", () => {
  const { runs, expected } = splitParagraphRuns();
  moveTo(runs, 1, 3);
  const result = p1WidowRule.check(
    makeInput(makeEvidence({ textRuns: runs }), expected),
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_WIDOW");
  assert.equal(result.findings[0]?.pageIndex, 1);
  assert.deepEqual(result.findings[0]?.basis.metrics, {
    linesAtPageStart: 1,
    templateWidows: 2,
    blockTotalLines: 4,
  });
});

test("p1-orphan/widow: split exactly at the template threshold is legal", () => {
  const { runs, expected } = splitParagraphRuns();
  moveTo(runs, 1, 2, 3);
  const input = makeInput(makeEvidence({ textRuns: runs }), expected);
  assert.equal(p1OrphanRule.check(input).findings.length, 0);
  assert.equal(p1WidowRule.check(input).findings.length, 0);
});

test("p1-orphan/widow: single-page paragraph and figure-member runs are excluded", () => {
  const { runs, expected } = splitParagraphRuns();
  const input = makeInput(makeEvidence({ textRuns: runs }), expected);
  assert.equal(p1OrphanRule.check(input).findings.length, 0);
  // 末行是 figure 成员（解析期事实）→ 不计入正文行，跨页身份不成立。
  const member = runs.map((run, index) =>
    index === 3 ? { ...run, pageIndex: 1, figureMcid: 1 } : run,
  );
  const evidence = makeEvidence({
    textRuns: member,
    figures: [
      {
        pageIndex: 1,
        mcid: 1,
        bbox: { x: 60, y: 780, width: 100, height: 100 },
        paintBBox: { x: 60, y: 780, width: 100, height: 100 },
        kind: "vector-figure",
        altShort: null,
        altLong: null,
      },
    ],
  });
  const memberAttribution = attributeBlocks(evidence, expected);
  const entry = memberAttribution.matched[0];
  assert.ok(entry !== undefined);
  assert.deepEqual(pagesOfBlock(memberAttribution, entry), [0]);
  assert.equal(p1WidowRule.check(makeInput(evidence, expected)).findings.length, 0);
});

test("p1-sparse-page: zero-content page is flagged; density evidence covers every page", () => {
  const evidence = makeEvidence(
    {
      textRuns: [
        makeRun({ pageIndex: 0, text: "字", width: 20, height: 10 }),
        makeRun({ pageIndex: 0, text: "字", width: 20, height: 10 }),
      ],
      figures: [],
    },
    2,
  );
  const result = p1SparsePageRule.check(makeInput(evidence, []));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_EMPTY_PAGE");
  assert.equal(result.findings[0]?.pageIndex, 1);
  assert.equal(result.findings[0]?.nodeRef, "page:1");
  assert.equal(result.manualChecks.length, 2);
  const boxArea =
    (CONTENT_BOX.right - CONTENT_BOX.left) * (CONTENT_BOX.top - CONTENT_BOX.bottom);
  const review = result.manualChecks[0];
  assert.equal(review?.code, "P1_SPARSE_DENSITY_REVIEW");
  assert.deepEqual(review?.basis.metrics, {
    textAreaPt2: 400,
    figureAreaPt2: 0,
    coverageRatio: 400 / boxArea,
    templateMaxConsecutiveSparsePages: 1,
  });
});

test("p1-sparse-page: low-but-nonzero density stays manual-only (no disguised auto verdict)", () => {
  const evidence = makeEvidence(
    { textRuns: [makeRun({ pageIndex: 0, text: "字", width: 1, height: 1 })] },
    1,
  );
  const result = p1SparsePageRule.check(makeInput(evidence, []));
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.ok((result.manualChecks[0]?.basis.metrics["coverageRatio"] ?? 1) < 0.001);
});
