/**
 * P1 检查输入与规则接口（PA-08）：唯一事实源是 PA-06 v1.1.0 证据模型
 * （禁重解析 PDF 的类型级保证）+ 文档侧期望块 + 版心 + 冻结模板
 * pagination_rules（widows/orphans/heading 阈值只从这里取，禁自定义）。
 * 每条规则同时产出自动发现（findings）与人工核验项（manualChecks）——
 * 凡无确定性或模板可溯源依据的判定必须显式降人工（诚实门）。
 */
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import type { PaginationRules } from "@wenshu/template-model";

import type { ExpectedBlock } from "./expected-content.ts";
import type { P1RuleId } from "./finding.ts";
import type { Finding, ManualCheck } from "./generated/check-report.ts";
import type { ContentBox } from "./layout.ts";

export interface P1CheckInput {
  readonly evidence: WenshuPdfEvidence;
  readonly expected: readonly ExpectedBlock[];
  readonly contentBox: ContentBox;
  /** 冻结模板 pagination_rules 的受控类型化值（validateTemplate 产出）。 */
  readonly paginationRules: PaginationRules;
}

export interface P1RuleResult {
  readonly findings: readonly Finding[];
  readonly manualChecks: readonly ManualCheck[];
}

export interface P1Rule {
  readonly id: P1RuleId;
  readonly check: (input: P1CheckInput) => P1RuleResult;
}
