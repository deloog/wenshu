/**
 * P1 表格规则单元测试（PA-09）：合成证据（纯函数层，不触文件系统）。
 * 覆盖命门对抗面：嵌入子串误配拒斥、同文重复格、单元格换行、列宽不均、
 * 块序/列序歧义 fail-closed、表头续页对账、行切断、无表格零误报。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import type { PaginationRules } from "@wenshu/template-model";

import type { ExpectedBlock } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import type { P1CheckInput } from "../src/p1-input.ts";
import { analyzeTables } from "../src/p1-tables.ts";
import { p1TableHeaderRepeatRule } from "../src/rules/p1-table-header-repeat.ts";
import { p1TableRowSplitRule } from "../src/rules/p1-table-row-split.ts";

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
function ch(over: {
  text: string;
  x: number;
  baselineY: number;
  pageIndex: number;
  blockOrder: number;
}): WenshuPdfEvidence["textRuns"][number] {
  runSeq += 1;
  return {
    pageIndex: over.pageIndex,
    text: over.text,
    bbox: { x: over.x, y: over.baselineY + 10, width: 10, height: 12 },
    baselineY: over.baselineY,
    fontSize: 12,
    font: FONT,
    blockOrder: over.blockOrder,
    readingOrder: runSeq - 1,
    viaActualText: false,
    figureMcid: null,
  };
}

/** 一个单元格 → 逐字 run（x 递增，同 baseline 同块序；lines>1 模拟换行）。 */
function cell(over: {
  text: string;
  x: number;
  baselineY: number;
  pageIndex: number;
  blockOrder: number;
  lines?: number;
}): WenshuPdfEvidence["textRuns"] {
  const chars = [...over.text];
  const lines = over.lines ?? 1;
  const perLine = Math.ceil(chars.length / lines);
  const runs: WenshuPdfEvidence["textRuns"] = [];
  chars.forEach((text, index) => {
    const line = Math.floor(index / perLine);
    runs.push(
      ch({
        text,
        x: over.x + (index % perLine) * 10,
        baselineY: over.baselineY - line * 14,
        pageIndex: over.pageIndex,
        blockOrder: over.blockOrder,
      }),
    );
  });
  return runs;
}

function eb(ref: string, text: string): ExpectedBlock {
  const kind = ref.includes("/columns/")
    ? ("table-header" as const)
    : ("table-cell" as const);
  return Object.freeze({ ref, text, repeatable: false, kind });
}

function tableExpected(
  root: string,
  headers: string[],
  rows: string[][],
): ExpectedBlock[] {
  const out: ExpectedBlock[] = headers.map((text, col) =>
    eb(`${root}/columns/${col}/header`, text),
  );
  rows.forEach((row, r) =>
    row.forEach((text, c) => out.push(eb(`${root}/rows/${r}/cells/${c}`, text))),
  );
  return out;
}

function makeEvidence(
  textRuns: WenshuPdfEvidence["textRuns"],
  pageCount = 2,
): WenshuPdfEvidence {
  return {
    evidenceVersion: "1.1.0",
    source: { sha256: SHA, pageCount, producer: "Skia/PDF m150" },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      index,
      mediaBox: [0, 0, 595.28, 841.89],
      widthPt: 595.28,
      heightPt: 841.89,
      rotate: 0 as const,
    })),
    textRuns,
    figures: [],
    fonts: [{ name: "A+TestSans", ...FONT, subtype: "Type3" }],
  };
}

function makeInput(
  evidence: WenshuPdfEvidence,
  expected: readonly ExpectedBlock[],
  paginationRules: PaginationRules = PAGINATION,
): P1CheckInput {
  return { evidence, expected, contentBox: CONTENT_BOX, paginationRules };
}

const ROOT = "/blocks/2/children/0";

/** 标准 2 列 2 行表（页 0），几何合法。 */
function simpleTable(pageIndex = 0): {
  runs: WenshuPdfEvidence["textRuns"];
  expected: ExpectedBlock[];
} {
  const runs = [
    ...cell({ text: "名称", x: 60, baselineY: 800, pageIndex, blockOrder: 10 }),
    ...cell({ text: "数量", x: 200, baselineY: 800, pageIndex, blockOrder: 11 }),
    ...cell({ text: "苹果", x: 60, baselineY: 780, pageIndex, blockOrder: 12 }),
    ...cell({ text: "三个", x: 200, baselineY: 780, pageIndex, blockOrder: 13 }),
    ...cell({ text: "香蕉", x: 60, baselineY: 760, pageIndex, blockOrder: 14 }),
    ...cell({ text: "五根", x: 200, baselineY: 760, pageIndex, blockOrder: 15 }),
  ];
  return {
    runs,
    expected: tableExpected(
      ROOT,
      ["名称", "数量"],
      [
        ["苹果", "三个"],
        ["香蕉", "五根"],
      ],
    ),
  };
}

test("attribution: embedded substring inside a single long run is rejected", () => {
  // 标题「六、风险、边界与降级」是单个 run：2 字表头「风险」落在其内部，
  // 非 run 边界对齐 → 必须拒斥，归属真表头（x=60/70）而非标题内部（x=101）。
  const titleRun = ch({
    text: "六、风险、边界与降级",
    x: 57,
    baselineY: 740,
    pageIndex: 0,
    blockOrder: 1,
  });
  const tableRuns = [
    ...cell({ text: "风险", x: 60, baselineY: 800, pageIndex: 0, blockOrder: 10 }),
    ...cell({ text: "严重度", x: 200, baselineY: 800, pageIndex: 0, blockOrder: 11 }),
    ...cell({ text: "溢出", x: 60, baselineY: 780, pageIndex: 0, blockOrder: 12 }),
    ...cell({ text: "高", x: 200, baselineY: 780, pageIndex: 0, blockOrder: 13 }),
  ];
  const expected = [
    eb("/blocks/0", "六、风险、边界与降级"),
    ...tableExpected(ROOT, ["风险", "严重度"], [["溢出", "高"]]),
  ];
  const analysis = analyzeTables(makeEvidence([titleRun, ...tableRuns], 1), expected);
  const table = analysis.tables[0];
  assert.equal(table?.violations, 0);
  const header = table?.headers.find((h) => h.text === "风险");
  assert.ok(header !== undefined);
  assert.deepEqual(
    header.runIndexes.map((i) => analysis.orderedRuns[i]?.bbox.x),
    [60, 70],
  );
});

test("attribution: duplicate text in earlier char-run title loses to table occurrence", () => {
  // 标题逐字 run（每字皆边界对齐）：「风险」两处皆对齐候选，反向文档序
  // 游标必须取阅读序上紧邻表格数据的真表头（x=60/70），不是标题（x=101/123）。
  const titleRuns = [..."六、风险、边界与降级"].map((text, i) =>
    ch({ text, x: 57 + i * 22, baselineY: 740, pageIndex: 0, blockOrder: 1 }),
  );
  const tableRuns = [
    ...cell({ text: "风险", x: 60, baselineY: 800, pageIndex: 0, blockOrder: 10 }),
    ...cell({ text: "严重度", x: 200, baselineY: 800, pageIndex: 0, blockOrder: 11 }),
    ...cell({ text: "溢出", x: 60, baselineY: 780, pageIndex: 0, blockOrder: 12 }),
    ...cell({ text: "高", x: 200, baselineY: 780, pageIndex: 0, blockOrder: 13 }),
  ];
  const expected = [
    eb("/blocks/0", "六、风险、边界与降级"),
    ...tableExpected(ROOT, ["风险", "严重度"], [["溢出", "高"]]),
  ];
  const analysis = analyzeTables(
    makeEvidence([...titleRuns, ...tableRuns], 1),
    expected,
  );
  const table = analysis.tables[0];
  assert.equal(table?.violations, 0);
  const header = table?.headers.find((h) => h.text === "风险");
  assert.deepEqual(
    header?.runIndexes.map((i) => analysis.orderedRuns[i]?.bbox.x),
    [60, 70],
  );
});

test("attribution: duplicate cell texts resolve by reverse document order", () => {
  const runs = [
    ...cell({ text: "指标", x: 60, baselineY: 800, pageIndex: 0, blockOrder: 10 }),
    ...cell({ text: "相同", x: 60, baselineY: 780, pageIndex: 0, blockOrder: 11 }),
    ...cell({ text: "甲", x: 200, baselineY: 780, pageIndex: 0, blockOrder: 12 }),
    ...cell({ text: "相同", x: 60, baselineY: 760, pageIndex: 0, blockOrder: 13 }),
    ...cell({ text: "乙", x: 200, baselineY: 760, pageIndex: 0, blockOrder: 14 }),
  ];
  const expected = tableExpected(
    ROOT,
    ["指标"],
    [
      ["相同", "甲"],
      ["相同", "乙"],
    ],
  );
  const analysis = analyzeTables(makeEvidence(runs, 1), expected);
  const table = analysis.tables[0];
  assert.equal(table?.violations, 0);
  const row0 = table?.cells.find((c) => c.row === 0 && c.col === 0);
  const row1 = table?.cells.find((c) => c.row === 1 && c.col === 0);
  assert.deepEqual(
    row0?.runIndexes.map((i) => analysis.orderedRuns[i]?.baselineY),
    [780, 780],
  );
  assert.deepEqual(
    row1?.runIndexes.map((i) => analysis.orderedRuns[i]?.baselineY),
    [760, 760],
  );
});

test("attribution: wrapped multi-line cell and skewed column widths stay consistent", () => {
  // 表头第二格换行（严重/度 两行同块序），列宽悬殊（窄列 20pt 宽内容）。
  const runs = [
    ...cell({ text: "风险", x: 60, baselineY: 800, pageIndex: 0, blockOrder: 10 }),
    ...cell({
      text: "严重度",
      x: 300,
      baselineY: 807,
      pageIndex: 0,
      blockOrder: 11,
      lines: 2,
    }),
    ...cell({
      text: "模型输出破坏内容",
      x: 60,
      baselineY: 770,
      pageIndex: 0,
      blockOrder: 12,
    }),
    ...cell({ text: "高", x: 300, baselineY: 770, pageIndex: 0, blockOrder: 13 }),
  ];
  const expected = tableExpected(
    ROOT,
    ["风险", "严重度"],
    [["模型输出破坏内容", "高"]],
  );
  const analysis = analyzeTables(makeEvidence(runs, 1), expected);
  assert.equal(analysis.tables[0]?.violations, 0);
});

test("attribution ambiguity: mixed block order within a cell fails closed", () => {
  // 单元格「苹果」的两字被赋予不同 MCID 块序 → 归属可疑 → fail-closed。
  const { runs, expected } = simpleTable();
  const apple = runs.filter((run) => run.blockOrder === 12);
  assert.equal(apple.length, 2);
  const second = apple[1];
  assert.ok(second !== undefined);
  second.blockOrder = 99;
  const input = makeInput(makeEvidence(runs, 1), expected);
  for (const rule of [p1TableHeaderRepeatRule, p1TableRowSplitRule]) {
    const result = rule.check(input);
    assert.equal(result.findings.length, 0);
    assert.equal(result.manualChecks.length, 1);
    assert.equal(result.manualChecks[0]?.code, "P1_TABLE_STRUCTURE_REVIEW");
    assert.equal(result.manualChecks[0]?.nodeRef, ROOT);
    assert.ok(
      (result.manualChecks[0]?.basis.metrics["attributionViolations"] ?? 0) >= 1,
    );
  }
});

test("attribution ambiguity: inverted column x-order fails closed", () => {
  // 列 1 的 x 落到列 0 左侧（归属错位）→ 歧义 → 人工项，无自动判定。
  const { runs, expected } = simpleTable();
  for (const run of runs) {
    if (run.blockOrder === 13 || run.blockOrder === 15) {
      run.bbox.x = 30;
    }
  }
  const input = makeInput(makeEvidence(runs, 1), expected);
  const result = p1TableRowSplitRule.check(input);
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
  assert.equal(result.manualChecks[0]?.code, "P1_TABLE_STRUCTURE_REVIEW");
});

test("attribution ambiguity: cell text absent from evidence fails closed (no guessing)", () => {
  const { runs, expected } = simpleTable();
  const input = makeInput(makeEvidence(runs.slice(0, 4), 1), expected);
  const result = p1TableRowSplitRule.check(input);
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 1);
});

/** 跨页表：表头+行0 在页 0，行1 在页 1；续页表头是否重复由参数控制。 */
function crossPageTable(over: { repeatHeader: boolean; headerBelowData?: boolean }): {
  runs: WenshuPdfEvidence["textRuns"];
  expected: ExpectedBlock[];
} {
  const runs = [
    ...cell({ text: "名称", x: 60, baselineY: 800, pageIndex: 0, blockOrder: 10 }),
    ...cell({ text: "数量", x: 200, baselineY: 800, pageIndex: 0, blockOrder: 11 }),
    ...cell({ text: "苹果", x: 60, baselineY: 780, pageIndex: 0, blockOrder: 12 }),
    ...cell({ text: "三个", x: 200, baselineY: 780, pageIndex: 0, blockOrder: 13 }),
    ...cell({ text: "香蕉", x: 60, baselineY: 760, pageIndex: 1, blockOrder: 20 }),
    ...cell({ text: "五根", x: 200, baselineY: 760, pageIndex: 1, blockOrder: 21 }),
  ];
  if (over.repeatHeader) {
    const headerBaseline = over.headerBelowData === true ? 730 : 800;
    runs.push(
      ...cell({
        text: "名称",
        x: 60,
        baselineY: headerBaseline,
        pageIndex: 1,
        blockOrder: 18,
      }),
      ...cell({
        text: "数量",
        x: 200,
        baselineY: headerBaseline,
        pageIndex: 1,
        blockOrder: 19,
      }),
    );
  }
  return {
    runs,
    expected: tableExpected(
      ROOT,
      ["名称", "数量"],
      [
        ["苹果", "三个"],
        ["香蕉", "五根"],
      ],
    ),
  };
}

test("header-repeat: repeated header on continuation page passes", () => {
  const { runs, expected } = crossPageTable({ repeatHeader: true });
  const result = p1TableHeaderRepeatRule.check(makeInput(makeEvidence(runs), expected));
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 0);
});

test("header-repeat: missing header on continuation page is flagged with counts", () => {
  const { runs, expected } = crossPageTable({ repeatHeader: false });
  const result = p1TableHeaderRepeatRule.check(makeInput(makeEvidence(runs), expected));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_TABLE_HEADER_NOT_REPEATED");
  assert.equal(result.findings[0]?.pageIndex, 1);
  assert.equal(result.findings[0]?.nodeRef, ROOT);
  assert.deepEqual(result.findings[0]?.basis.metrics, {
    continuationPage: 1,
    headersExpected: 2,
    headersFound: 0,
    templateRepeatHeader: 1,
  });
});

test("header-repeat: header text below the first data row does not count", () => {
  const { runs, expected } = crossPageTable({
    repeatHeader: true,
    headerBelowData: true,
  });
  const result = p1TableHeaderRepeatRule.check(makeInput(makeEvidence(runs), expected));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_TABLE_HEADER_NOT_REPEATED");
});

test("header-repeat: template table_repeat_header=false disables the check", () => {
  const { runs, expected } = crossPageTable({ repeatHeader: false });
  const result = p1TableHeaderRepeatRule.check(
    makeInput(makeEvidence(runs), expected, {
      ...PAGINATION,
      table_repeat_header: false,
    }),
  );
  assert.equal(result.findings.length, 0);
});

test("row-split: cells of one row on both sides of the page boundary are flagged", () => {
  const { runs, expected } = crossPageTable({ repeatHeader: true });
  // 行 0 的第二格移到页 1 → 行 0 被切断（页 0/页 1 两侧）。
  for (const run of runs) {
    if (run.blockOrder === 13) {
      run.pageIndex = 1;
    }
  }
  const result = p1TableRowSplitRule.check(makeInput(makeEvidence(runs), expected));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.code, "P1_TABLE_ROW_SPLIT");
  assert.equal(result.findings[0]?.pageIndex, 0);
  assert.equal(result.findings[0]?.nodeRef, `${ROOT}/rows/0`);
  assert.deepEqual(result.findings[0]?.basis.metrics, {
    continuationPage: 1,
    cellsOnFirstPage: 1,
    cellsOnContinuationPage: 1,
    templateRowBreakInsideAvoid: 1,
  });
});

test("row-split: whole rows per page (table crosses at row boundary) is legal", () => {
  const { runs, expected } = crossPageTable({ repeatHeader: true });
  const result = p1TableRowSplitRule.check(makeInput(makeEvidence(runs), expected));
  assert.equal(result.findings.length, 0);
  assert.equal(result.manualChecks.length, 0);
});

test("no-table document and single-page table produce zero table output", () => {
  const { runs, expected } = simpleTable();
  for (const rule of [p1TableHeaderRepeatRule, p1TableRowSplitRule]) {
    const noTable = rule.check(
      makeInput(makeEvidence(runs, 1), [eb("/blocks/0", "苹果")].slice(0, 0)),
    );
    assert.equal(noTable.findings.length, 0);
    assert.equal(noTable.manualChecks.length, 0);
    const singlePage = rule.check(makeInput(makeEvidence(runs, 1), expected));
    assert.equal(singlePage.findings.length, 0);
    assert.equal(singlePage.manualChecks.length, 0);
  }
});
