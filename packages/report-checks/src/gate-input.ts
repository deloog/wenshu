/**
 * 汇总闸门输入（PA-12）：闸门消费 PA-07~11 既有检查的真实产出（findings +
 * manualChecks），不重实现任何检查、不 mock。fault 样本自签署基线证据
 * 确定性内存派生（冻结物零漂移）。豁免只接受 P1 规则（类型级排除 P0）；
 * 运行时对不可信输入仍 fail-closed 拒绝任何 P0 豁免尝试。
 */
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import type { PaginationRules } from "@wenshu/template-model";

import type { ExpectedBlock } from "./expected-content.ts";
import type { P0Code, P0RuleId, P1Code, P1RuleId } from "./finding.ts";
import type { ContentBox } from "./layout.ts";

/** 跑全检查族所需的受控输入（与各 PA 集成测试同一装配口径）。 */
export interface GateCheckContext {
  readonly expected: readonly ExpectedBlock[];
  readonly contentBox: ContentBox;
  readonly paginationRules: PaginationRules;
  readonly headerText?: string | undefined;
}

/** 一个待闸样本：正常样本或确定性派生的 fault 样本。 */
export interface GateSampleInput {
  readonly sampleId: string;
  readonly kind: "normal" | "fault";
  readonly summary: string;
  readonly evidence: WenshuPdfEvidence;
  /** fault 样本必填：注入缺陷的严重级。 */
  readonly severity?: "P0" | "P1";
  /** fault 样本必填：注入缺陷所属检查域（规则 id）。 */
  readonly domain?: P0RuleId | P1RuleId;
  /** fault 样本必填：注入缺陷必须产出的 findings 码（manualChecks 不充数）。 */
  readonly expectedCodes?: readonly (P0Code | P1Code)[];
}

/**
 * 单条规则豁免（PoC-A 阶段只对 P1）：类型级排除 P0；运行时对不可信输入
 * 仍逐条复核，任何 P0 豁免尝试抛 GATE_P0_EXEMPTION_REJECTED。
 */
export interface GateExemption {
  readonly ruleId: P1RuleId;
  readonly reason: string;
}

export interface GateInput extends GateCheckContext {
  /** 签署基线 PDF 的 SHA-256（正常样本与全部 fault 派生的锚点）。 */
  readonly baselineSha256: string;
  readonly samples: readonly GateSampleInput[];
}

export interface GateRunOptions {
  readonly exemptions?: readonly GateExemption[];
}

/** fault 样本派生上下文：只读锚点 + 受控装配输入。 */
export interface GateFaultContext {
  readonly baseline: WenshuPdfEvidence;
  readonly expected: readonly ExpectedBlock[];
  readonly contentBox: ContentBox;
}

/**
 * 一个 fault 样本定义：注入真实、非稻草人缺陷，自签署基线确定性派生。
 * derive 必须纯函数：同锚点同派生；锚点缺失即 GATE_FAULT_ANCHOR fail-closed。
 */
export interface GateFaultSpec {
  readonly sampleId: string;
  readonly severity: "P0" | "P1";
  readonly domain: P0RuleId | P1RuleId;
  readonly summary: string;
  readonly expectedCodes: readonly (P0Code | P1Code)[];
  readonly derive: (context: GateFaultContext) => WenshuPdfEvidence;
}
