/**
 * P1 运行器单元测试（PA-08）：回滚（findings 与 manualChecks 一并回退）、
 * 未知规则/旧版证据 fail-closed、确定性、产物自洽 1.1.0 契约。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import type { PaginationRules } from "@wenshu/template-model";

import { ReportChecksError } from "../src/check-input.ts";
import type { ExpectedBlock } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import type { P1CheckInput } from "../src/p1-input.ts";
import { runP1Checks } from "../src/p1-runner.ts";

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

function eb(ref: string, text: string, kind: ExpectedBlock["kind"]): ExpectedBlock {
  return Object.freeze({ ref, text, repeatable: false, kind });
}

function makeInput(
  evidence: WenshuPdfEvidence,
  expected: readonly ExpectedBlock[],
): P1CheckInput {
  return { evidence, expected, contentBox: CONTENT_BOX, paginationRules: PAGINATION };
}

function run(
  over: { pageIndex?: number; text?: string; baselineY?: number },
  readingOrder: number,
): WenshuPdfEvidence["textRuns"][number] {
  return {
    pageIndex: over.pageIndex ?? 0,
    text: over.text ?? "字",
    bbox: { x: 60, y: (over.baselineY ?? 780) + 10, width: 10, height: 12 },
    baselineY: over.baselineY ?? 780,
    fontSize: 12,
    font: FONT,
    blockOrder: 1,
    readingOrder,
    viaActualText: false,
    figureMcid: null,
  };
}

/** 双 fault 输入：标题分离（p0 页 0 行后继）+ 空页（p1 零内容）。 */
function multiFaultInput(): P1CheckInput {
  const evidence = makeEvidence({
    textRuns: [run({ pageIndex: 0, text: "章一", baselineY: 800 }, 0)],
  });
  const expected = [
    eb("/blocks/0", "章一", "section-title"),
    eb("/blocks/0/children/0", "消失的段", "paragraph"),
  ];
  return makeInput(evidence, expected);
}

test("p1 runner: report is 1.1.0, self-validates, rules listed in fixed order", () => {
  const report = runP1Checks(multiFaultInput());
  assert.equal(report.checkReportVersion, "1.1.0");
  assert.deepEqual(report.rules, [
    "p1-heading-keep",
    "p1-orphan",
    "p1-widow",
    "p1-sparse-page",
    "p1-table-header-repeat",
    "p1-table-row-split",
    "p1-figure-caption",
    "p1-figure-source",
    "p1-figure-aspect",
    "p1-figure-fidelity",
    "p1-figure-legibility",
    "p1-toc-reconcile",
    "p1-toc-page-match",
    "p1-stamp-consistency",
  ]);
  assert.equal(report.source.evidenceSha256, SHA);
  // 标题后继块缺失（P0 域）→ 标题规则跳过；空页命中；合成页无压印 →
  // 非封面页页眉/页脚缺失如实发现（PA-11B）；每页有人工密度项。
  assert.deepEqual(
    report.findings.map((finding) => finding.code),
    ["P1_EMPTY_PAGE", "P1_FOOTER_MISSING", "P1_HEADER_MISSING"],
  );
  assert.equal(report.manualChecks.length, 2);
  assert.ok(Object.isFrozen(report));
});

test("p1 runner: heading separation fault is detected via the runner", () => {
  const evidence = makeEvidence({
    textRuns: [
      run({ pageIndex: 0, text: "章一", baselineY: 800 }, 0),
      run({ pageIndex: 1, text: "正文", baselineY: 800 }, 1),
    ],
  });
  const expected = [
    eb("/blocks/0", "章一", "section-title"),
    eb("/blocks/0/children/0", "正文", "paragraph"),
  ];
  const report = runP1Checks(makeInput(evidence, expected));
  // 页 1 正文存在但无压印 → 页眉/页脚缺失一并如实发现。
  assert.deepEqual(
    report.findings.map((finding) => `${finding.code}@${finding.pageIndex}`),
    ["P1_HEADING_SEPARATED@0", "P1_FOOTER_MISSING@1", "P1_HEADER_MISSING@1"],
  );
});

test("p1 runner: per-rule rollback suppresses findings and manualChecks of that rule only", () => {
  const input = multiFaultInput();
  const full = runP1Checks(input);
  assert.ok(full.findings.some((finding) => finding.code === "P1_EMPTY_PAGE"));
  assert.ok(
    full.manualChecks.some((manual) => manual.code === "P1_SPARSE_DENSITY_REVIEW"),
  );
  const rolledBack = runP1Checks(input, { disabledRules: ["p1-sparse-page"] });
  assert.deepEqual(rolledBack.rules, [
    "p1-heading-keep",
    "p1-orphan",
    "p1-widow",
    "p1-table-header-repeat",
    "p1-table-row-split",
    "p1-figure-caption",
    "p1-figure-source",
    "p1-figure-aspect",
    "p1-figure-fidelity",
    "p1-figure-legibility",
    "p1-toc-reconcile",
    "p1-toc-page-match",
    "p1-stamp-consistency",
  ]);
  assert.ok(
    rolledBack.findings.every((finding) => finding.ruleId !== "p1-sparse-page"),
  );
  assert.ok(
    rolledBack.manualChecks.every((manual) => manual.ruleId !== "p1-sparse-page"),
  );
});

test("p1 runner: unknown disabled rule id fails closed", () => {
  assert.throws(
    () => runP1Checks(multiFaultInput(), { disabledRules: ["p9-nope" as never] }),
    (error: unknown) =>
      error instanceof ReportChecksError && error.code === "REPORT_CHECKS_UNKNOWN_RULE",
  );
});

test("p1 runner: legacy 1.0.0 evidence fails closed (no membership facts)", () => {
  const legacy = {
    ...makeEvidence({}),
    evidenceVersion: "1.0.0",
  } as unknown as WenshuPdfEvidence;
  assert.throws(
    () => runP1Checks(makeInput(legacy, [])),
    (error: unknown) =>
      error instanceof ReportChecksError &&
      error.code === "REPORT_CHECKS_UNSUPPORTED_EVIDENCE",
  );
});

test("p1 runner: identical input yields byte-identical reports", () => {
  const first = JSON.stringify(runP1Checks(multiFaultInput()));
  const second = JSON.stringify(runP1Checks(multiFaultInput()));
  assert.equal(first, second);
});

test("p1 runner: findings and manualChecks never echo document text", () => {
  const evidence = makeEvidence({
    textRuns: [run({ pageIndex: 0, text: "机密标题文本", baselineY: 800 }, 0)],
  });
  const expected = [
    eb("/blocks/0", "机密标题文本", "section-title"),
    eb("/blocks/0/children/0", "机密正文", "paragraph"),
  ];
  const serialized = JSON.stringify(runP1Checks(makeInput(evidence, expected)));
  assert.ok(!serialized.includes("机密"));
});
