/**
 * P0 检查输入：检查的唯一事实来源是 PA-06 证据模型（禁重解析 PDF 的
 * 类型级保证）+ 文档侧期望块 + 版心。禁 mock——集成测试用真实证据。
 * 证据契约 1.1.0（PA-06B）：p0-overlap 的成员制豁免消费 textRuns[].figureMcid
 * 与 figures[].paintBBox；1.0.0 证据无成员事实，运行时 fail-closed。
 */
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";

import type { ExpectedBlock } from "./expected-content.ts";
import type { Finding } from "./generated/check-report.ts";
import type { P0RuleId } from "./finding.ts";
import type { ContentBox } from "./layout.ts";

export interface P0CheckInput {
  readonly evidence: WenshuPdfEvidence;
  readonly expected: readonly ExpectedBlock[];
  readonly contentBox: ContentBox;
}

export interface P0Rule {
  readonly id: P0RuleId;
  readonly check: (input: P0CheckInput) => readonly Finding[];
}

export class ReportChecksError extends Error {
  public readonly code:
    | "REPORT_CHECKS_UNKNOWN_RULE"
    | "REPORT_CHECKS_INTERNAL"
    | "REPORT_CHECKS_UNSUPPORTED_EVIDENCE"
    | "GATE_P0_EXEMPTION_REJECTED"
    | "GATE_FAULT_ANCHOR"
    | "GATE_INTERNAL";

  public constructor(code: ReportChecksError["code"], message: string) {
    super(message);
    this.name = "ReportChecksError";
    this.code = code;
  }
}
