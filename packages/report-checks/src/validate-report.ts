/**
 * 报告校验：contract-runtime 结构预算 + 版本前置 + ajv + 语义
 * （findings 的 ruleId 必须属于本次执行的规则集）。诊断只含 code+path。
 */
import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import reportSchema from "../schema/check-report.schema.json" with { type: "json" };
import type { WenshuCheckReport } from "./generated/check-report.ts";

export const CHECK_REPORT_VERSION = "1.0.0" as const;

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
  | { readonly ok: true; readonly value: WenshuCheckReport }
  | { readonly ok: false; readonly issues: readonly ReportIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<WenshuCheckReport>(reportSchema);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(code: ReportIssueCode, path: string): ReportIssue {
  return Object.freeze({ code, path });
}

export function validateCheckReport(input: unknown): ReportValidationResult {
  const inspection = inspectData(input, { maxDepth: 64, maxNodes: 100_000 });
  if (!inspection.ok) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue("CHECK_REPORT_STRUCTURE", inspection.path)]),
    });
  }
  if (
    isRecord(input) &&
    "checkReportVersion" in input &&
    input["checkReportVersion"] !== CHECK_REPORT_VERSION
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue("CHECK_REPORT_VERSION", "/checkReportVersion")]),
    });
  }
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      issue("CHECK_REPORT_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const semanticIssues: ReportIssue[] = [];
  const executed = new Set(input.rules);
  input.findings.forEach((finding, index) => {
    if (!executed.has(finding.ruleId)) {
      semanticIssues.push(issue("CHECK_REPORT_SEMANTIC", `/findings/${index}/ruleId`));
    }
  });
  if (semanticIssues.length > 0) {
    return Object.freeze({ ok: false, issues: Object.freeze(semanticIssues) });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
