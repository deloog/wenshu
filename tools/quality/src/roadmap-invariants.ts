/**
 * G2-04 roadmap invariants gate: orchestrates parse → checks → report.
 * Always prints the parse counts and the number of unparsed rows, because
 * "the gate ran" is not the same as "the gate checked".
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { QualityFinding } from "./guardrails.ts";
import { parseRoadmap } from "./roadmap-parse.ts";
import {
  checkConsumerTruthfulness,
  checkCriticalPathBasis,
  checkRequirementCoverage,
  checkWaveConflicts,
} from "./roadmap-checks-consistency.ts";
import { checkLedgerEvidence } from "./roadmap-checks-evidence.ts";
import {
  checkDependencyCycles,
  checkLedgerMonotonicity,
  checkTaskIdentity,
} from "./roadmap-checks-structure.ts";
import type { ParseCounts } from "./roadmap-model.ts";
import { ROADMAP_REGISTRY, type RoadmapRegistry } from "./roadmap-registry.ts";

export interface RoadmapInvariantResult {
  readonly findings: readonly QualityFinding[];
  readonly counts: ParseCounts;
  readonly unparsedRows: number;
}

const COUNT_LABELS = Object.freeze([
  ["tasks", "任务数"],
  ["dependencyEdges", "依赖边数"],
  ["requirementIds", "R-* 定义数"],
  ["ledgerEntries", "台账条目数"],
  ["criticalPathEdges", "§3 边数"],
  ["waveGroups", "§9 并行组数"],
] as const);

/** Runs all ten judgments against one roadmap file (fail-closed). */
export async function checkRoadmapInvariants(
  roadmapPath: string,
  registry: RoadmapRegistry = ROADMAP_REGISTRY,
): Promise<RoadmapInvariantResult> {
  const text = await readFile(roadmapPath, "utf8");
  const { model, issues } = parseRoadmap(text);
  const findings: QualityFinding[] = [];
  for (const issue of issues) {
    findings.push(
      Object.freeze({
        rule: "roadmap-parse",
        severity: "error",
        filePath: roadmapPath,
        line: issue.line,
        message: issue.message,
      }),
    );
  }
  const floors = registry.parseCountFloors;
  for (const [key, label] of COUNT_LABELS) {
    if (model.counts[key] < floors[key]) {
      findings.push(
        Object.freeze({
          rule: "roadmap-count-floor",
          severity: "error",
          filePath: roadmapPath,
          line: 1,
          message: `解析计数低于登记下限：${label} ${model.counts[key]} < ${floors[key]}（解析可能已静默退化）`,
        }),
      );
    }
  }
  findings.push(
    ...checkTaskIdentity(model, roadmapPath),
    ...checkDependencyCycles(model, roadmapPath),
    ...checkLedgerMonotonicity(model, registry, roadmapPath),
    ...checkRequirementCoverage(model, roadmapPath),
    ...checkCriticalPathBasis(model, roadmapPath),
    ...checkWaveConflicts(model, registry, roadmapPath),
    ...checkConsumerTruthfulness(model, roadmapPath),
  );
  const roadmapDir = dirname(roadmapPath);
  findings.push(
    ...(await checkLedgerEvidence(
      model,
      registry,
      roadmapDir,
      join(roadmapDir, "audits"),
      roadmapPath,
    )),
  );
  return Object.freeze({
    findings: Object.freeze(findings),
    counts: model.counts,
    unparsedRows: issues.length,
  });
}

/** One summary line, printed whether the gate passes or fails. */
export function formatRoadmapCounts(result: RoadmapInvariantResult): string {
  const floors = ROADMAP_REGISTRY.parseCountFloors;
  const parts = COUNT_LABELS.map(
    ([key, label]) => `${label} ${result.counts[key]}(下限 ${floors[key]})`,
  );
  return `Roadmap invariants: ${parts.join("，")}；未解析行 ${result.unparsedRows}`;
}
