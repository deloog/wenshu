/**
 * P1 检查输入与规则接口（PA-08）：唯一事实源是 PA-06 v1.1.0 证据模型
 * （禁重解析 PDF 的类型级保证）+ 文档侧期望块 + 版心 + 冻结模板
 * pagination_rules（widows/orphans/heading 阈值只从这里取，禁自定义）。
 * 每条规则同时产出自动发现（findings）与人工核验项（manualChecks）——
 * 凡无确定性或模板可溯源依据的判定必须显式降人工（诚实门）。
 */
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
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
  /**
   * 页眉期望文本（PA-11B）：front matter short_title 声明值（归一前原文，
   * 规则内归一对账）。缺省时页眉文本对账按诚实门降人工（ADR-0011 §4）。
   */
  readonly headerText?: string | undefined;
  /**
   * 压印 run（PA-11B）：runner 装配时以 stamp-scope 单源口径从原始证据
   * 选中后注入（P1 各规则的 evidence 已排除压印）；手工装配输入缺省时
   * 规则自行以同一口径从 input.evidence 补选。
   */
  readonly stampRuns?: readonly TextRun[];
}

export interface P1RuleResult {
  readonly findings: readonly Finding[];
  readonly manualChecks: readonly ManualCheck[];
}

export interface P1Rule {
  readonly id: P1RuleId;
  readonly check: (input: P1CheckInput) => P1RuleResult;
}
