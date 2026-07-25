/**
 * P0 运行器：固定规则序执行、按 id 禁用（单条回滚）、确定性排序、
 * 产物过自身报告契约（fail-closed）。同输入同结果。
 */
import { ReportChecksError, type P0CheckInput, type P0Rule } from "./check-input.ts";
import { P0_RULE_IDS, type P0RuleId } from "./finding.ts";
import type { Finding, WenshuCheckReport } from "./generated/check-report.ts";
import { p0BoundsRule } from "./rules/p0-bounds.ts";
import { p0ContentRule } from "./rules/p0-content.ts";
import { p0OverlapRule } from "./rules/p0-overlap.ts";
import { p0PageSizeRule } from "./rules/p0-page-size.ts";
import { CHECK_REPORT_VERSION, validateCheckReport } from "./validate-report.ts";

export const P0_RULES: readonly P0Rule[] = Object.freeze([
  p0PageSizeRule,
  p0BoundsRule,
  p0OverlapRule,
  p0ContentRule,
]);

export interface P0RunOptions {
  /** 按规则 id 禁用（回滚单条规则）；未知 id fail-closed。 */
  readonly disabledRules?: readonly P0RuleId[];
}

export function runP0Checks(
  input: P0CheckInput,
  options?: P0RunOptions,
): WenshuCheckReport {
  const disabled = new Set<string>(options?.disabledRules ?? []);
  for (const id of disabled) {
    if (!(P0_RULE_IDS as readonly string[]).includes(id)) {
      throw new ReportChecksError(
        "REPORT_CHECKS_UNKNOWN_RULE",
        `unknown rule id in disabledRules: ${id}`,
      );
    }
  }
  const executed = P0_RULES.filter((rule) => !disabled.has(rule.id));
  const findings: Finding[] = [];
  for (const rule of executed) {
    findings.push(...rule.check(input));
  }
  findings.sort(
    (a, b) =>
      a.ruleId.localeCompare(b.ruleId) ||
      a.pageIndex - b.pageIndex ||
      a.nodeRef.localeCompare(b.nodeRef),
  );
  const report: WenshuCheckReport = {
    checkReportVersion: CHECK_REPORT_VERSION,
    source: { evidenceSha256: input.evidence.source.sha256 },
    rules: executed.map((rule) => rule.id),
    findings,
  };
  const validation = validateCheckReport(report);
  if (!validation.ok) {
    throw new ReportChecksError(
      "REPORT_CHECKS_INTERNAL",
      "runner produced a report that violates its own contract",
    );
  }
  return validation.value;
}
