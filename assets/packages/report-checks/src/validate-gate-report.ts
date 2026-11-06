/**
 * 门禁报告校验（PA-12）：contract-runtime 结构预算 + 版本前置 + ajv +
 * 语义重算——读者不信任何自报数字：逐样本 detected/falsePositives 从
 * findings 重算（manualChecks 绝不充数）、门槛评估与 verdict/failureCodes
 * 全量重算、executedRules 必须是全规则集减去已申报豁免（防选择性跳过）、
 * 豁免不得含 P0。诊断只含 code+path，不回显内容。
 */
import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import gateReportSchema from "../schema/gate-report.schema.json" with { type: "json" };
import { P0_RULE_IDS, P1_RULE_IDS } from "./finding.ts";
import { GATE_THRESHOLDS, type GateFailureCode } from "./gate-evaluate.ts";
import type { WenshuGateReport } from "./generated/gate-report.ts";

export const GATE_REPORT_VERSION = "1.0.0" as const;
export const SUPPORTED_GATE_REPORT_VERSIONS = Object.freeze(["1.0.0"] as const);

export type GateReportIssueCode =
  | "GATE_REPORT_SCHEMA"
  | "GATE_REPORT_SEMANTIC"
  | "GATE_REPORT_STRUCTURE"
  | "GATE_REPORT_VERSION";

export interface GateReportIssue {
  readonly code: GateReportIssueCode;
  readonly path: string;
}

export type GateReportValidationResult =
  | { readonly ok: true; readonly value: WenshuGateReport }
  | { readonly ok: false; readonly issues: readonly GateReportIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<WenshuGateReport>(gateReportSchema);

function issue(code: GateReportIssueCode, path: string): GateReportIssue {
  return Object.freeze({ code, path });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ALL_RULE_IDS: readonly string[] = [...P0_RULE_IDS, ...P1_RULE_IDS];

function semanticIssues(report: WenshuGateReport): GateReportIssue[] {
  const issues: GateReportIssue[] = [];
  const exemptionIds = new Set<string>();
  report.exemptions.forEach((exemption, index) => {
    if ((P0_RULE_IDS as readonly string[]).includes(exemption.ruleId)) {
      issues.push(issue("GATE_REPORT_SEMANTIC", `/exemptions/${index}/ruleId`));
    }
    if (!ALL_RULE_IDS.includes(exemption.ruleId)) {
      issues.push(issue("GATE_REPORT_SEMANTIC", `/exemptions/${index}/ruleId`));
    }
    exemptionIds.add(exemption.ruleId);
  });

  // executedRules 必须 = 全规则集 − 已申报豁免（防选择性跳过/伪装覆盖）。
  const expectedRules = ALL_RULE_IDS.filter((id) => !exemptionIds.has(id));
  const actual = [...report.executedRules].sort();
  const expected = [...expectedRules].sort();
  if (actual.length !== expected.length || actual.some((id, i) => id !== expected[i])) {
    issues.push(issue("GATE_REPORT_SEMANTIC", "/executedRules"));
  }
  const executedSet = new Set(report.executedRules);

  // 逐样本重算：detected 只看 findings；falsePositives === findings.length；
  // findings/manualChecks 的 ruleId 必须属于已执行规则集。
  let normalFalsePositives = 0;
  let detectedFaults = 0;
  let p0FaultSampleCount = 0;
  let p0DetectedFaults = 0;
  report.samples.forEach((sample, index) => {
    sample.findings.forEach((finding, findingIndex) => {
      if (!executedSet.has(finding.ruleId)) {
        issues.push(
          issue(
            "GATE_REPORT_SEMANTIC",
            `/samples/${index}/findings/${findingIndex}/ruleId`,
          ),
        );
      }
    });
    sample.manualChecks.forEach((manual, manualIndex) => {
      if (!executedSet.has(manual.ruleId)) {
        issues.push(
          issue(
            "GATE_REPORT_SEMANTIC",
            `/samples/${index}/manualChecks/${manualIndex}/ruleId`,
          ),
        );
      }
    });
    if (sample.kind === "normal") {
      normalFalsePositives += sample.findings.length;
      if (sample.falsePositives !== sample.findings.length) {
        issues.push(issue("GATE_REPORT_SEMANTIC", `/samples/${index}/falsePositives`));
      }
      return;
    }
    const detected = sample.expectedCodes.every((code) =>
      sample.findings.some((finding) => finding.code === code),
    );
    if (sample.detected !== detected) {
      issues.push(issue("GATE_REPORT_SEMANTIC", `/samples/${index}/detected`));
    }
    if (detected) {
      detectedFaults += 1;
      if (sample.severity === "P0") {
        p0DetectedFaults += 1;
      }
    }
    if (sample.severity === "P0") {
      p0FaultSampleCount += 1;
    }
  });

  // 门槛评估全量重算（计数只基于真实 findings 重算值）。
  const evaluation = report.evaluation;
  const faultSampleCount = report.samples.filter(
    (sample) => sample.kind === "fault",
  ).length;
  const p0DetectionRate =
    p0FaultSampleCount === 0 ? 1 : p0DetectedFaults / p0FaultSampleCount;
  const failureCodes: GateFailureCode[] = [];
  if (p0DetectedFaults < p0FaultSampleCount) {
    failureCodes.push("GATE_P0_MISSED");
  }
  if (detectedFaults < GATE_THRESHOLDS.minDetectedFaults) {
    failureCodes.push("GATE_DETECTION_BELOW_THRESHOLD");
  }
  if (normalFalsePositives > GATE_THRESHOLDS.maxNormalFalsePositives) {
    failureCodes.push("GATE_FALSE_POSITIVE_OVERFLOW");
  }
  const verdict = failureCodes.length === 0 ? "pass" : "fail";
  const counters: readonly [number, number, string][] = [
    [evaluation.faultSampleCount, faultSampleCount, "/evaluation/faultSampleCount"],
    [evaluation.detectedFaults, detectedFaults, "/evaluation/detectedFaults"],
    [
      evaluation.p0FaultSampleCount,
      p0FaultSampleCount,
      "/evaluation/p0FaultSampleCount",
    ],
    [evaluation.p0DetectedFaults, p0DetectedFaults, "/evaluation/p0DetectedFaults"],
    [
      evaluation.normalFalsePositives,
      normalFalsePositives,
      "/evaluation/normalFalsePositives",
    ],
  ];
  for (const [reported, recomputed, path] of counters) {
    if (reported !== recomputed) {
      issues.push(issue("GATE_REPORT_SEMANTIC", path));
    }
  }
  if (evaluation.p0DetectionRate !== p0DetectionRate) {
    issues.push(issue("GATE_REPORT_SEMANTIC", "/evaluation/p0DetectionRate"));
  }
  if (evaluation.verdict !== verdict) {
    issues.push(issue("GATE_REPORT_SEMANTIC", "/evaluation/verdict"));
  }
  const reportedCodes = [...evaluation.failureCodes].sort();
  const recomputedCodes = [...failureCodes].sort();
  if (
    reportedCodes.length !== recomputedCodes.length ||
    reportedCodes.some((code, i) => code !== recomputedCodes[i])
  ) {
    issues.push(issue("GATE_REPORT_SEMANTIC", "/evaluation/failureCodes"));
  }
  return issues;
}

export function validateGateReport(input: unknown): GateReportValidationResult {
  const inspection = inspectData(input, { maxDepth: 64, maxNodes: 100_000 });
  if (!inspection.ok) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue("GATE_REPORT_STRUCTURE", inspection.path)]),
    });
  }
  if (isRecord(input) && "gateReportVersion" in input) {
    if (input["gateReportVersion"] !== GATE_REPORT_VERSION) {
      return Object.freeze({
        ok: false,
        issues: Object.freeze([issue("GATE_REPORT_VERSION", "/gateReportVersion")]),
      });
    }
  }
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      issue("GATE_REPORT_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const semantics = semanticIssues(input);
  if (semantics.length > 0) {
    return Object.freeze({ ok: false, issues: Object.freeze(semantics) });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
