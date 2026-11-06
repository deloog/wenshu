/**
 * p1-widow（PA-08）：孤行——段落跨页分裂时页首保留行 < 模板 widows。
 * 阈值取自冻结模板 pagination_rules.widows（禁自定义）；恰好等于阈值
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
  const widows = input.paginationRules.widows;
  const { splits } = findParagraphSplits(input);
  const findings: Finding[] = [];
  for (const split of splits) {
    if (split.lastPageLines < widows) {
      findings.push(
        makeFinding("p1-widow", "P1_WIDOW", split.lastPage, split.blockRef, {
          linesAtPageStart: split.lastPageLines,
          templateWidows: widows,
          blockTotalLines: split.totalLines,
        }),
      );
    }
  }
  return { findings, manualChecks: [] };
}

export const p1WidowRule: P1Rule = Object.freeze({
  id: "p1-widow",
  check,
});
