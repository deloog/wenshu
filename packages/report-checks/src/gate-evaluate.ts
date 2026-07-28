/**
 * 门槛评估（PA-12 命门）：对真实检查产出诚实计数——检出只计 findings
 * （manualChecks 永不充数）、P0 未全检出即 FAIL、误报诚实计数。门槛
 * 常量钉死（与契约 schema 常量一致，调低门槛必须改契约版本）。
 */
import type { GateEvaluation } from "./generated/gate-report.ts";

export const GATE_THRESHOLDS = Object.freeze({
  faultSampleCount: 12,
  minDetectedFaults: 10,
  maxNormalFalsePositives: 2,
} as const);

export type GateFailureCode =
  "GATE_P0_MISSED" | "GATE_DETECTION_BELOW_THRESHOLD" | "GATE_FALSE_POSITIVE_OVERFLOW";

/** 单样本评估输入（runner 实测后的诚实事实）。 */
export interface EvaluatedSample {
  readonly kind: "normal" | "fault";
  readonly severity?: "P0" | "P1";
  /** fault：每个期望码都出现在真实 findings（manualChecks 不算）。 */
  readonly detected?: boolean;
  /** normal：真实 findings 数（误报诚实计数）。 */
  readonly falsePositives?: number;
}

export function evaluateGate(samples: readonly EvaluatedSample[]): GateEvaluation {
  const faults = samples.filter((sample) => sample.kind === "fault");
  const p0Faults = faults.filter((sample) => sample.severity === "P0");
  const detectedFaults = faults.filter((sample) => sample.detected === true).length;
  const p0DetectedFaults = p0Faults.filter((sample) => sample.detected === true).length;
  const normalFalsePositives = samples
    .filter((sample) => sample.kind === "normal")
    .reduce((total, sample) => total + (sample.falsePositives ?? 0), 0);
  const p0DetectionRate =
    p0Faults.length === 0 ? 1 : p0DetectedFaults / p0Faults.length;

  const failureCodes: GateFailureCode[] = [];
  if (p0DetectedFaults < p0Faults.length) {
    failureCodes.push("GATE_P0_MISSED");
  }
  if (detectedFaults < GATE_THRESHOLDS.minDetectedFaults) {
    failureCodes.push("GATE_DETECTION_BELOW_THRESHOLD");
  }
  if (normalFalsePositives > GATE_THRESHOLDS.maxNormalFalsePositives) {
    failureCodes.push("GATE_FALSE_POSITIVE_OVERFLOW");
  }

  return {
    faultSampleCount: faults.length,
    detectedFaults,
    p0FaultSampleCount: p0Faults.length,
    p0DetectedFaults,
    p0DetectionRate,
    normalFalsePositives,
    verdict: failureCodes.length === 0 ? "pass" : "fail",
    failureCodes,
  };
}
