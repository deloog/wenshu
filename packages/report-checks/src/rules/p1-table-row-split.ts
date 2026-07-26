/**
 * p1-table-row-split（PA-09）：同一行（/rows/<r>）的单元格 run 不得
 * 分处页界两侧（模板 table_row_break_inside:"avoid"）。行身份来自
 * 文档表结构（DOM 对账），行内单元格 run 的页集合 >1 即检出。
 * 结构归属歧义的表 fail-closed：只报 P1_TABLE_STRUCTURE_REVIEW
 * 人工核验，不作自动判定（不猜）。
 * 严重级证成（书面）：行被切断但内容完整（不缺字=P0-content 域）、
 * 无物理越界/遮挡（PA-07 域），违反模板声明式分页规则 → P1，
 * 与 PA-08 孤行寡行同属分页质量。
 */
import { makeFinding } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";
import { analyzeTables, type TableCellInfo } from "../p1-tables.ts";
import { structureReview } from "./p1-table-header-repeat.ts";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  const analysis = analyzeTables(input.evidence, input.expected);
  for (const table of analysis.tables) {
    if (table.violations > 0) {
      manualChecks.push(structureReview("p1-table-row-split", analysis, table));
      continue;
    }
    const rows = new Map<number, TableCellInfo[]>();
    for (const cell of table.cells) {
      const list = rows.get(cell.row) ?? [];
      list.push(cell);
      rows.set(cell.row, list);
    }
    for (const [rowIndex, rowCells] of [...rows.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const pages = new Set<number>();
      for (const cell of rowCells) {
        for (const runIndex of cell.runIndexes) {
          const run = analysis.orderedRuns[runIndex];
          if (run !== undefined) {
            pages.add(run.pageIndex);
          }
        }
      }
      const orderedPages = [...pages].sort((a, b) => a - b);
      for (let i = 1; i < orderedPages.length; i += 1) {
        const firstPage = orderedPages[i - 1];
        const continuationPage = orderedPages[i];
        if (firstPage === undefined || continuationPage === undefined) {
          continue;
        }
        const countOn = (page: number): number =>
          rowCells.filter((cell) =>
            cell.runIndexes.some(
              (runIndex) => analysis.orderedRuns[runIndex]?.pageIndex === page,
            ),
          ).length;
        findings.push(
          makeFinding(
            "p1-table-row-split",
            "P1_TABLE_ROW_SPLIT",
            firstPage,
            `${table.root}/rows/${rowIndex}`,
            {
              continuationPage,
              cellsOnFirstPage: countOn(firstPage),
              cellsOnContinuationPage: countOn(continuationPage),
              templateRowBreakInsideAvoid: 1,
            },
          ),
        );
      }
    }
  }
  return { findings, manualChecks };
}

export const p1TableRowSplitRule: P1Rule = Object.freeze({
  id: "p1-table-row-split",
  check,
});
