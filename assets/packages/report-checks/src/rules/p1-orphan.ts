/**
 * p1-orphan（PA-08）：寡行——段落跨页分裂时页尾保留行 < 模板 orphans。
 * 阈值取自冻结模板 pagination_rules.orphans（禁自定义）；恰好等于阈值
 * 是合法排版，不报。本规则无人工核验项：分裂行数与模板阈值都是
 * 确定性事实。
 */
import { makeFinding } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import { findParagraphSplits } from "../p1-splits.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const orphans = input.paginationRules.orphans;
  const { splits } = findParagraphSplits(input);
  const findings: Finding[] = [];
  for (const split of splits) {
    if (split.firstPageLines < orphans) {
      findings.push(
        makeFinding("p1-orphan", "P1_ORPHAN", split.firstPage, split.blockRef, {
          linesAtPageEnd: split.firstPageLines,
          templateOrphans: orphans,
          blockTotalLines: split.totalLines,
        }),
      );
    }
  }
  return { findings, manualChecks: [] };
}

export const p1OrphanRule: P1Rule = Object.freeze({
  id: "p1-orphan",
  check,
});
