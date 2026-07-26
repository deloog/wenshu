/**
 * p1-table-header-repeat（PA-09）：跨页表格的表头须按模板
 * table_repeat_header:true 在每一续页重复。对账方式：文档表头文本
 * vs 续页 run——续页列带内、整体位于首行数据之上存在整串匹配。
 * 结构归属歧义的表 fail-closed：只报 P1_TABLE_STRUCTURE_REVIEW
 * 人工核验，不作自动判定（不猜）。
 * 严重级证成（书面）：表头未重复不缺字（P0-content 域）、不越界
 * 不遮挡（PA-07 域），违反的是模板声明式分页规则，与 PA-08 孤行
 * 寡行同属分页质量 → P1。
 */
import { makeFinding, makeManualCheck } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";
import { columnBands, headerRepeatedOnPage, tablePages } from "../p1-table-pages.ts";
import {
  analyzeTables,
  type TableAnalysis,
  type TableStructure,
} from "../p1-tables.ts";

export const TABLE_STRUCTURE_REVIEW_REASON =
  "表结构到 run 归属存在歧义（对齐/块序/行列几何校验未过），fail-closed 不作自动判定，降人工核验。";

export function structureReview(
  ruleId: "p1-table-header-repeat" | "p1-table-row-split",
  analysis: TableAnalysis,
  table: TableStructure,
): ManualCheck {
  const firstPage = tablePages(analysis, table)[0] ?? 0;
  return makeManualCheck(
    ruleId,
    "P1_TABLE_STRUCTURE_REVIEW",
    firstPage,
    table.root,
    TABLE_STRUCTURE_REVIEW_REASON,
    { attributionViolations: table.violations },
  );
}

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  const analysis = analyzeTables(input.evidence, input.expected);
  if (!input.paginationRules.table_repeat_header) {
    return { findings, manualChecks };
  }
  for (const table of analysis.tables) {
    if (table.violations > 0) {
      manualChecks.push(structureReview("p1-table-header-repeat", analysis, table));
      continue;
    }
    const pages = tablePages(analysis, table);
    if (pages.length < 2) {
      continue;
    }
    const bands = columnBands(analysis, table);
    for (const page of pages.slice(1)) {
      // 续页首行数据基线（该页数据单元格 run 的最大 baseline）。
      let firstDataBaseline = Number.NEGATIVE_INFINITY;
      for (const cell of table.cells) {
        for (const runIndex of cell.runIndexes) {
          const run = analysis.orderedRuns[runIndex];
          if (run !== undefined && run.pageIndex === page) {
            firstDataBaseline = Math.max(firstDataBaseline, run.baselineY);
          }
        }
      }
      const missing = table.headers.filter((header) => {
        const band = bands.get(header.col);
        return (
          band === undefined ||
          !headerRepeatedOnPage(
            input.evidence,
            header.text,
            band,
            page,
            firstDataBaseline,
          )
        );
      });
      if (missing.length > 0) {
        findings.push(
          makeFinding(
            "p1-table-header-repeat",
            "P1_TABLE_HEADER_NOT_REPEATED",
            page,
            table.root,
            {
              continuationPage: page,
              headersExpected: table.headers.length,
              headersFound: table.headers.length - missing.length,
              templateRepeatHeader: 1,
            },
            missing[0]?.ref,
          ),
        );
      }
    }
  }
  return { findings, manualChecks };
}

export const p1TableHeaderRepeatRule: P1Rule = Object.freeze({
  id: "p1-table-header-repeat",
  check,
});
