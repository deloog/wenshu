/**
 * P0 运行器：固定规则序执行、按 id 禁用（单条回滚）、确定性排序、
 * 产物过自身报告契约（fail-closed）。同输入同结果。
 */
import { ReportChecksError, type P0CheckInput, type P0Rule } from "./check-input.ts";
import { P0_RULE_IDS, type P0RuleId } from "./finding.ts";
import type { WenshuCheckReportV1_0_0 } from "./generated/check-report-1.0.0.ts";
import type { Finding } from "./generated/check-report.ts";
import { p0BoundsRule } from "./rules/p0-bounds.ts";
import { p0ContentRule } from "./rules/p0-content.ts";
import { p0OverlapRule } from "./rules/p0-overlap.ts";
import { p0PageSizeRule } from "./rules/p0-page-size.ts";
import { CHECK_REPORT_VERSION_1_0_0, validateCheckReport } from "./validate-report.ts";

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
): WenshuCheckReportV1_0_0 {
  const disabled = new Set<string>(options?.disabledRules ?? []);
  for (const id of disabled) {
    if (!(P0_RULE_IDS as readonly string[]).includes(id)) {
      throw new ReportChecksError(
        "REPORT_CHECKS_UNKNOWN_RULE",
        `unknown rule id in disabledRules: ${id}`,
      );
    }
  }
  // p0-overlap 的成员制豁免依赖 1.1.0 成员事实（figureMcid/paintBBox）；
  // 旧版证据没有该事实，放行会把成员误判为非成员——fail-closed。
  if (input.evidence.evidenceVersion !== "1.1.0") {
    throw new ReportChecksError(
      "REPORT_CHECKS_UNSUPPORTED_EVIDENCE",
      "p0 checks require evidence contract 1.1.0 (figure membership facts)",
    );
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
  // P0 报告维持 PA-07 签署时的冻结契约 1.0.0；manualChecks 是 P1 域
  // （PA-08 additive 1.1.0），不回填进 P0 产物。
  const report: WenshuCheckReportV1_0_0 = {
    checkReportVersion: CHECK_REPORT_VERSION_1_0_0,
    source: { evidenceSha256: input.evidence.source.sha256 },
    rules: executed.map((rule) => rule.id),
    findings,
  };
  const validation = validateCheckReport(report);
  if (
    !validation.ok ||
    validation.value.checkReportVersion !== CHECK_REPORT_VERSION_1_0_0
  ) {
    throw new ReportChecksError(
      "REPORT_CHECKS_INTERNAL",
      "runner produced a report that violates its own contract",
    );
  }
  return validation.value;
}
