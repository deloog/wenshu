/**
 * 报告校验：contract-runtime 结构预算 + 版本前置 + ajv + 语义
 * （findings/manualChecks 的 ruleId 必须属于本次执行的规则集）。
 * 诊断只含 code+path。additive 升级纪律（PA-08）：当前生产器版本 1.1.0
 * （manualChecks 诚实门），读取方同时接受冻结的 1.0.0。
 */
import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import reportSchemaV1_0_0 from "../schema/check-report-1.0.0.schema.json" with { type: "json" };
import reportSchema from "../schema/check-report.schema.json" with { type: "json" };
import type { WenshuCheckReportV1_0_0 } from "./generated/check-report-1.0.0.ts";
import type { WenshuCheckReport } from "./generated/check-report.ts";

/** 当前生产器版本（P1 运行器）；P0 运行器仍生产冻结的 1.0.0。 */
export const CHECK_REPORT_VERSION = "1.1.0" as const;
export const CHECK_REPORT_VERSION_1_0_0 = "1.0.0" as const;
export const SUPPORTED_CHECK_REPORT_VERSIONS = Object.freeze([
  "1.0.0",
  "1.1.0",
] as const);

/** 读取方接受的支持版本报告：1.1.0（含 manualChecks）或冻结 1.0.0。 */
export type SupportedCheckReport = WenshuCheckReport | WenshuCheckReportV1_0_0;

export type ReportIssueCode =
  | "CHECK_REPORT_SCHEMA"
  | "CHECK_REPORT_SEMANTIC"
  | "CHECK_REPORT_STRUCTURE"
  | "CHECK_REPORT_VERSION";

export interface ReportIssue {
  readonly code: ReportIssueCode;
  readonly path: string;
}

export type ReportValidationResult =
  | { readonly ok: true; readonly value: SupportedCheckReport }
  | { readonly ok: false; readonly issues: readonly ReportIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<WenshuCheckReport>(reportSchema);
const validateShapeV1_0_0 = ajv.compile<WenshuCheckReportV1_0_0>(reportSchemaV1_0_0);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(code: ReportIssueCode, path: string): ReportIssue {
  return Object.freeze({ code, path });
}

function semanticIssuesOf(
  rules: readonly string[],
  findings: readonly { ruleId: string }[],
  manualChecks: readonly { ruleId: string }[],
): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const executed = new Set(rules);
  findings.forEach((finding, index) => {
    if (!executed.has(finding.ruleId)) {
      issues.push(issue("CHECK_REPORT_SEMANTIC", `/findings/${index}/ruleId`));
    }
  });
  manualChecks.forEach((manual, index) => {
    if (!executed.has(manual.ruleId)) {
      issues.push(issue("CHECK_REPORT_SEMANTIC", `/manualChecks/${index}/ruleId`));
    }
  });
  return issues;
}

export function validateCheckReport(input: unknown): ReportValidationResult {
  const inspection = inspectData(input, { maxDepth: 64, maxNodes: 100_000 });
  if (!inspection.ok) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue("CHECK_REPORT_STRUCTURE", inspection.path)]),
    });
  }
  if (isRecord(input) && "checkReportVersion" in input) {
    const version = input["checkReportVersion"];
    if (version === CHECK_REPORT_VERSION_1_0_0) {
      if (!validateShapeV1_0_0(input)) {
        const issues = (validateShapeV1_0_0.errors ?? []).map((error) =>
          issue("CHECK_REPORT_SCHEMA", error.instancePath || "/"),
        );
        return Object.freeze({ ok: false, issues: Object.freeze(issues) });
      }
      const semanticIssues = semanticIssuesOf(input.rules, input.findings, []);
      if (semanticIssues.length > 0) {
        return Object.freeze({ ok: false, issues: Object.freeze(semanticIssues) });
      }
      return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
    }
    if (version !== CHECK_REPORT_VERSION) {
      return Object.freeze({
        ok: false,
        issues: Object.freeze([issue("CHECK_REPORT_VERSION", "/checkReportVersion")]),
      });
    }
  }
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      issue("CHECK_REPORT_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const semanticIssues = semanticIssuesOf(
    input.rules,
    input.findings,
    input.manualChecks,
  );
  if (semanticIssues.length > 0) {
    return Object.freeze({ ok: false, issues: Object.freeze(semanticIssues) });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
