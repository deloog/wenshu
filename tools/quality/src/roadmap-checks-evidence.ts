/**
 * Evidence checks 8a/8b/8c: ledger ↔ Claude audit report coverage.
 * 8a catches "audit done but never entered the ledger"; 8b catches
 * "ledger claims done but points at no evidence of its own" — the two
 * directions are independent and neither substitutes for the other.
 */
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { QualityFinding } from "./guardrails.ts";
import type { RoadmapModel } from "./roadmap-model.ts";
import type { RoadmapRegistry } from "./roadmap-registry.ts";

const REPORT_SUFFIX = "-claude-audit-report.md";

function finding(
  rule: string,
  filePath: string,
  line: number,
  message: string,
): QualityFinding {
  return Object.freeze({ rule, severity: "error", filePath, line, message });
}

/** Basenames of audit reports a ledger row may link to satisfy 8b. */
export function allowedReportsForTask(
  task: string,
  registry: RoadmapRegistry,
): readonly string[] {
  const identifiers = [task];
  for (const exception of registry.auditReportExceptions) {
    if (exception.countsAsTaskReportFor.includes(task)) {
      identifiers.push(exception.report);
    }
  }
  return Object.freeze(identifiers.map((id) => `${id}${REPORT_SUFFIX}`));
}

function check8a(
  model: RoadmapModel,
  registry: RoadmapRegistry,
  reportIds: readonly string[],
  filePath: string,
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const ledgerIds = new Set(model.ledger.map((row) => row.id));
  const exceptions = new Set(
    registry.auditReportExceptions.map((entry) => entry.report),
  );
  for (const id of reportIds) {
    if (!ledgerIds.has(id) && !exceptions.has(id)) {
      findings.push(
        finding(
          "roadmap-audit-report-without-ledger",
          filePath,
          1,
          `审计报告 "${id}${REPORT_SUFFIX}" 的任务标识在 §3.1 台账中没有条目，且不在封闭例外表`,
        ),
      );
    }
  }
  for (const entry of registry.auditReportExceptions) {
    if (!reportIds.includes(entry.report)) {
      findings.push(
        finding(
          "roadmap-registry-stale",
          filePath,
          1,
          `审计报告例外登记 "${entry.report}" 对应的报告文件不存在，须更新登记表`,
        ),
      );
    }
  }
  return findings;
}

function check8b(
  model: RoadmapModel,
  registry: RoadmapRegistry,
  reportIds: readonly string[],
  filePath: string,
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const exempt = new Set(
    registry.ledgerRowsWithoutIndependentReport.map((entry) => entry.task),
  );
  for (const entry of registry.ledgerRowsWithoutIndependentReport) {
    const rowExists = model.ledger.some((row) => row.id === entry.task);
    const reportAppeared = reportIds.includes(entry.task);
    if (!rowExists || reportAppeared) {
      findings.push(
        finding(
          "roadmap-registry-stale",
          filePath,
          1,
          `无独立报告豁免登记 "${entry.task}" 与现状不符（${reportAppeared ? "已出现独立报告" : "台账行不存在"}），须更新登记表`,
        ),
      );
    }
  }
  for (const row of model.ledger) {
    if (exempt.has(row.id)) continue;
    const allowed = allowedReportsForTask(row.id, registry);
    const linked = row.links.some((target) => allowed.includes(basenameOf(target)));
    if (!linked) {
      findings.push(
        finding(
          "roadmap-ledger-missing-report-link",
          filePath,
          row.line,
          `台账行 ${row.id} 未链接其自身的审计报告（允许：${allowed.join("、")}），且不在无独立报告豁免表`,
        ),
      );
    }
  }
  return findings;
}

function basenameOf(target: string): string {
  return target.split("/").pop() ?? target;
}

function check8c(
  model: RoadmapModel,
  roadmapDir: string,
  filePath: string,
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const row of model.ledger) {
    for (const target of row.links) {
      if (/^https?:\/\//u.test(target)) continue;
      if (!existsSync(resolve(roadmapDir, target))) {
        findings.push(
          finding(
            "roadmap-ledger-broken-link",
            filePath,
            row.line,
            `台账行 ${row.id} 的链接 "${target}" 无法解析到存在的文件`,
          ),
        );
      }
    }
  }
  return findings;
}

/** Runs checks 8a/8b/8c against the real audits directory and file system. */
export async function checkLedgerEvidence(
  model: RoadmapModel,
  registry: RoadmapRegistry,
  roadmapDir: string,
  auditsDir: string,
  filePath: string,
): Promise<readonly QualityFinding[]> {
  const entries = await readdir(auditsDir);
  const reportIds = entries
    .filter((entry) => entry.endsWith(REPORT_SUFFIX))
    .map((entry) => entry.slice(0, entry.length - REPORT_SUFFIX.length));
  return Object.freeze([
    ...check8a(model, registry, reportIds, filePath),
    ...check8b(model, registry, reportIds, filePath),
    ...check8c(model, roadmapDir, filePath),
  ]);
}
