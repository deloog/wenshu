/**
 * PA-12 fault 样本目录（固定序，12 例）：P0 四域（尺寸/越界/遮挡/内容）
 * + P1 八域（标题/孤行/寡行/留白/表格/图片/目录页码/页脚页码），覆盖
 * PA-K1（图遮正文，PA-07 检出域）与 PA-11A（实际页码红线）边界。每个
 * 样本注入真实缺陷并自签署基线确定性内存派生，不挑软柿子：各域各一例，
 * 无重复域充数。
 */
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";

import type { GateCheckContext, GateFaultSpec, GateSampleInput } from "./gate-input.ts";
import { P0_FAULT_SAMPLES } from "./gate-faults-p0.ts";
import { P1_LAYOUT_FAULT_SAMPLES } from "./gate-faults-p1-layout.ts";
import { P1_OBJECT_FAULT_SAMPLES } from "./gate-faults-p1-objects.ts";

export const GATE_FAULT_SAMPLES: readonly GateFaultSpec[] = Object.freeze([
  ...P0_FAULT_SAMPLES,
  ...P1_LAYOUT_FAULT_SAMPLES,
  ...P1_OBJECT_FAULT_SAMPLES,
]);

/**
 * 装配闸门样本集：正常样本（签署基线，误报诚实计数载体）在前，12 个
 * fault 样本按目录固定序派生。derive 只消费只读锚点上下文。
 */
export function buildGateSamples(
  baseline: WenshuPdfEvidence,
  context: GateCheckContext,
): readonly GateSampleInput[] {
  const faultContext = {
    baseline,
    expected: context.expected,
    contentBox: context.contentBox,
  };
  return Object.freeze([
    Object.freeze({
      sampleId: "normal-baseline",
      kind: "normal" as const,
      summary: "签署基线正常样本（正常误报诚实计数载体，期望 0 自动发现）。",
      evidence: baseline,
    }),
    ...GATE_FAULT_SAMPLES.map((spec) =>
      Object.freeze({
        sampleId: spec.sampleId,
        kind: "fault" as const,
        severity: spec.severity,
        domain: spec.domain,
        summary: spec.summary,
        expectedCodes: spec.expectedCodes,
        evidence: spec.derive(faultContext),
      }),
    ),
  ]);
}
