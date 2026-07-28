/**
 * P1 运行器（PA-08）：固定规则序执行、按 id 禁用（单条回滚）、确定性
 * 排序、产物过自身报告契约（fail-closed）。同输入同结果。
 * 报告契约 1.1.0：findings（自动判定）与 manualChecks（人工核验，
 * 诚实门）严格分列——人工核验项的存在既不是通过也不是发现。
 */
import { ReportChecksError } from "./check-input.ts";
import { P1_RULE_IDS, type P1RuleId } from "./finding.ts";
import type {
  Finding,
  ManualCheck,
  WenshuCheckReport,
} from "./generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "./p1-input.ts";
import { p1HeadingKeepRule } from "./rules/p1-heading-keep.ts";
import { p1FigureAspectRule } from "./rules/p1-figure-aspect.ts";
import { p1FigureCaptionRule } from "./rules/p1-figure-caption.ts";
import { p1FigureFidelityRule } from "./rules/p1-figure-fidelity.ts";
import { p1FigureLegibilityRule } from "./rules/p1-figure-legibility.ts";
import { p1FigureSourceRule } from "./rules/p1-figure-source.ts";
import { p1OrphanRule } from "./rules/p1-orphan.ts";
import { p1SparsePageRule } from "./rules/p1-sparse-page.ts";
import { p1TableHeaderRepeatRule } from "./rules/p1-table-header-repeat.ts";
import { p1TableRowSplitRule } from "./rules/p1-table-row-split.ts";
import { p1WidowRule } from "./rules/p1-widow.ts";
import { stripStampRuns } from "./stamp-scope.ts";
import { CHECK_REPORT_VERSION, validateCheckReport } from "./validate-report.ts";

export const P1_RULES: readonly P1Rule[] = Object.freeze([
  p1HeadingKeepRule,
  p1OrphanRule,
  p1WidowRule,
  p1SparsePageRule,
  p1TableHeaderRepeatRule,
  p1TableRowSplitRule,
  p1FigureCaptionRule,
  p1FigureSourceRule,
  p1FigureAspectRule,
  p1FigureFidelityRule,
  p1FigureLegibilityRule,
]);

export interface P1RunOptions {
  /** 按规则 id 禁用（回滚单条规则）；未知 id fail-closed。 */
  readonly disabledRules?: readonly P1RuleId[];
}

function byDeterministicOrder(
  a: { ruleId: string; pageIndex: number; nodeRef: string },
  b: { ruleId: string; pageIndex: number; nodeRef: string },
): number {
  return (
    a.ruleId.localeCompare(b.ruleId) ||
    a.pageIndex - b.pageIndex ||
    a.nodeRef.localeCompare(b.nodeRef)
  );
}

export function runP1Checks(
  input: P1CheckInput,
  options?: P1RunOptions,
): WenshuCheckReport {
  const disabled = new Set<string>(options?.disabledRules ?? []);
  for (const id of disabled) {
    if (!(P1_RULE_IDS as readonly string[]).includes(id)) {
      throw new ReportChecksError(
        "REPORT_CHECKS_UNKNOWN_RULE",
        `unknown rule id in disabledRules: ${id}`,
      );
    }
  }
  // P1 行聚合排除 figure 成员 run，依赖 1.1.0 成员事实（figureMcid）；
  // 旧版证据没有该事实，会把图内文本误算成正文行——fail-closed。
  if (input.evidence.evidenceVersion !== "1.1.0") {
    throw new ReportChecksError(
      "REPORT_CHECKS_UNSUPPORTED_EVIDENCE",
      "p1 checks require evidence contract 1.1.0 (figure membership facts)",
    );
  }
  const executed = P1_RULES.filter((rule) => !disabled.has(rule.id));
  // 压印 run（页眉页脚受控补偿）不进任何 P1 判定（PA-11A 口径，单一收口）。
  const scopedInput: P1CheckInput = {
    ...input,
    evidence: stripStampRuns(input.evidence),
  };
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  for (const rule of executed) {
    const result = rule.check(scopedInput);
    findings.push(...result.findings);
    manualChecks.push(...result.manualChecks);
  }
  findings.sort(byDeterministicOrder);
  manualChecks.sort(byDeterministicOrder);
  const report: WenshuCheckReport = {
    checkReportVersion: CHECK_REPORT_VERSION,
    source: { evidenceSha256: input.evidence.source.sha256 },
    rules: executed.map((rule) => rule.id),
    findings,
    manualChecks,
  };
  const validation = validateCheckReport(report);
  if (!validation.ok || validation.value.checkReportVersion !== CHECK_REPORT_VERSION) {
    throw new ReportChecksError(
      "REPORT_CHECKS_INTERNAL",
      "p1 runner produced a report that violates its own contract",
    );
  }
  return validation.value;
}
