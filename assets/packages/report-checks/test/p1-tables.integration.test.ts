/**
 * P1 表格集成测试（PA-09）：真实签署基线证据 + 真实冻结模板 +
 * 内存派生 fault（不改冻结物）。覆盖验收①②③④⑤：跨页表头未重复/
 * 行切断 fault 检出+定位、基线与无表格零误报、结构归属对账、阈值溯源。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { tablePages } from "../src/p1-table-pages.ts";
import { analyzeTables } from "../src/p1-tables.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");

const baselineBytes = new Uint8Array(
  readFileSync(
    resolve(
      repoRoot,
      "packages",
      "pdf-evidence",
      "fixtures",
      "baseline",
      "golden-report-baseline.pdf",
    ),
  ),
);
assert.equal(
  createHash("sha256").update(baselineBytes).digest("hex"),
  SIGNED_BASELINE_SHA256,
  "baseline fixture must be the PA-05 signed artifact",
);
const extracted = extractEvidence(baselineBytes);
assert.ok(extracted.ok, "signed baseline must extract");
const baselineEvidence = extracted.evidence;

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgSources = Object.keys(imported.renames).map((original) =>
  readFileSync(resolve(fixtureRoot, original), "utf8"),
);
const expected = buildExpectedBlocks(
  imported.document,
  svgSources.map((source) => extractSvgText(source)),
  svgSources.map((source) => extractSvgAspectRatio(source)),
);

const templateResult = validateTemplate(
  JSON.parse(
    readFileSync(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
);
assert.ok(templateResult.ok, "frozen template must validate via the controlled path");
const firstPage = baselineEvidence.pages[0];
assert.ok(firstPage !== undefined);
const contentBox = contentBoxFromMargins(
  templateResult.value.page.margin_mm,
  firstPage.widthPt,
  firstPage.heightPt,
);
const paginationRules = templateResult.value.pagination_rules;

function inputFor(evidence: WenshuPdfEvidence) {
  return {
    evidence,
    expected,
    contentBox,
    paginationRules,
    headerText: imported.metadata["short_title"],
  };
}

function derive(mutate: (draft: WenshuPdfEvidence) => void): WenshuPdfEvidence {
  const draft = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  mutate(draft);
  return draft;
}

/** 表 3（主要风险与首期处置）：基线唯一跨页表（p12→p13，探针实测）。 */
const TABLE3_ROOT = "/blocks/7/children/2/children/2/children/0";

test("acceptance 3: baseline tables attribute cleanly; exactly one cross-page table", () => {
  const analysis = analyzeTables(baselineEvidence, expected);
  assert.equal(analysis.tables.length, 5);
  assert.ok(
    analysis.tables.every((table) => table.violations === 0),
    JSON.stringify(
      analysis.tables.map((table) => ({
        root: table.root,
        violations: table.violations,
      })),
    ),
  );
  const crossPage = analysis.tables.filter(
    (table) => tablePages(analysis, table).length > 1,
  );
  assert.deepEqual(
    crossPage.map((table) => table.root),
    [TABLE3_ROOT],
  );
  const firstCrossPage = crossPage[0];
  assert.ok(firstCrossPage !== undefined);
  assert.deepEqual(tablePages(analysis, firstCrossPage), [12, 13]);
});

test("acceptance 2: signed baseline yields zero table findings and zero structure reviews", () => {
  const report = runP1Checks(inputFor(baselineEvidence));
  assert.ok(
    report.findings.every((finding) => !finding.ruleId.startsWith("p1-table-")),
  );
  assert.ok(
    report.manualChecks.every((manual) => manual.code !== "P1_TABLE_STRUCTURE_REVIEW"),
  );
  // PA-08 钉数不回潮 + PA-10 诚实门：人工项 33（PA-11A 重签后 21 页 →
  // 逐页密度 21 + 标题灰区 10 + 图片清晰度 2；表格规则在基线零新增人工噪音）。
  assert.equal(report.manualChecks.length, 33);
});

test("acceptance 1: header not repeated on continuation page is detected and located", () => {
  // 找表 3 续页 p13 上位于首行数据之前的 run（= Chromium 重复的表头副本），
  // 内存派生中删除它们（这些 run 是 repeatable 额外出现，不影响块归属）。
  const analysis = analyzeTables(baselineEvidence, expected);
  const table3 = analysis.tables.find((table) => table.root === TABLE3_ROOT);
  assert.ok(table3 !== undefined);
  const dataOrders = table3.cells.flatMap((cell) =>
    cell.runIndexes.flatMap((runIndex) => {
      const run = analysis.orderedRuns[runIndex];
      return run !== undefined && run.pageIndex === 13 ? [run.readingOrder] : [];
    }),
  );
  assert.ok(dataOrders.length > 0);
  const firstDataOrder = Math.min(...dataOrders);
  const removed = baselineEvidence.textRuns.filter(
    (run) => run.pageIndex === 13 && run.readingOrder < firstDataOrder,
  );
  assert.ok(removed.length >= 10, "repeated header runs must exist on p13");
  const removedOrders = new Set(removed.map((run) => run.readingOrder));
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.filter(
      (run) => !removedOrders.has(run.readingOrder),
    );
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_TABLE_HEADER_NOT_REPEATED",
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 5)));
  assert.equal(hits[0]?.pageIndex, 13);
  assert.equal(hits[0]?.nodeRef, TABLE3_ROOT);
  assert.equal(hits[0]?.basis.metrics["headersExpected"], 4);
  assert.equal(hits[0]?.basis.metrics["headersFound"], 0);
  assert.equal(hits[0]?.basis.metrics["templateRepeatHeader"], 1);
  assert.equal(paginationRules.table_repeat_header, true);
});

test("acceptance 1: row split across the page boundary is detected at table/row ref", () => {
  // 把表 3 行 2（续页首数据行）首格 run 移回 p12 → 行 2 被页界切断。
  const analysis = analyzeTables(baselineEvidence, expected);
  const table3 = analysis.tables.find((table) => table.root === TABLE3_ROOT);
  assert.ok(table3 !== undefined);
  const cell = table3.cells.find(
    (candidate) => candidate.row === 2 && candidate.col === 0,
  );
  assert.ok(cell !== undefined);
  const orders = new Set(
    cell.runIndexes.map((runIndex) => {
      const run = analysis.orderedRuns[runIndex];
      assert.ok(run !== undefined);
      assert.equal(run.pageIndex, 13);
      return run.readingOrder;
    }),
  );
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (orders.has(run.readingOrder)) {
        run.pageIndex = 12;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_TABLE_ROW_SPLIT",
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 5)));
  assert.equal(hits[0]?.pageIndex, 12);
  assert.equal(hits[0]?.nodeRef, `${TABLE3_ROOT}/rows/2`);
  assert.equal(hits[0]?.basis.metrics["continuationPage"], 13);
  assert.equal(hits[0]?.basis.metrics["templateRowBreakInsideAvoid"], 1);
  assert.equal(paginationRules.table_row_break_inside, "avoid");
});

test("acceptance 2: no-table expectation over the same evidence yields zero table output", () => {
  const noTableExpected = expected.filter(
    (block) => block.kind !== "table-header" && block.kind !== "table-cell",
  );
  const report = runP1Checks({
    evidence: baselineEvidence,
    expected: noTableExpected,
    contentBox,
    paginationRules,
    headerText: imported.metadata["short_title"],
  });
  assert.ok(
    report.findings.every((finding) => !finding.ruleId.startsWith("p1-table-")),
  );
  assert.ok(
    report.manualChecks.every((manual) => manual.code !== "P1_TABLE_STRUCTURE_REVIEW"),
  );
});

test("acceptance 5: per-rule rollback isolates table rules; output stays deterministic", () => {
  const analysis = analyzeTables(baselineEvidence, expected);
  const table3 = analysis.tables.find((table) => table.root === TABLE3_ROOT);
  assert.ok(table3 !== undefined);
  const cell = table3.cells.find(
    (candidate) => candidate.row === 2 && candidate.col === 0,
  );
  assert.ok(cell !== undefined);
  const orders = new Set(
    cell.runIndexes.map((runIndex) => analysis.orderedRuns[runIndex]?.readingOrder),
  );
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (orders.has(run.readingOrder)) {
        run.pageIndex = 12;
      }
    }
  });
  const rolledBack = runP1Checks(inputFor(fault), {
    disabledRules: ["p1-table-row-split"],
  });
  assert.ok(
    rolledBack.findings.every((finding) => finding.ruleId !== "p1-table-row-split"),
  );
  assert.ok(
    rolledBack.rules.includes("p1-table-header-repeat") &&
      !rolledBack.rules.includes("p1-table-row-split"),
  );
  const first = JSON.stringify(runP1Checks(inputFor(fault)));
  const second = JSON.stringify(runP1Checks(inputFor(fault)));
  assert.equal(first, second);
  assert.ok(!first.includes("首期处置"));
});
