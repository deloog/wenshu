/**
 * Fail-closed parser for docs/implementation-roadmap.md.
 *
 * Parsing markdown tables can silently degrade to "0 tasks, 0 edges" when
 * the format changes, at which point every invariant would "pass". This
 * parser therefore reports every table row it cannot parse inside the
 * structural regions, requires the declared sections to exist, and emits
 * the parse counts that the gate compares against registered floors.
 *
 * Region-specific row parsers live in roadmap-parse-regions.ts; this file
 * only locates the sections and assembles the model.
 */
import { headingIndex, type Region } from "./roadmap-markdown.ts";
import type { ParseIssue, RoadmapParseResult } from "./roadmap-model.ts";
import {
  parseCriticalPath,
  parseLedger,
  parseMatrixRequirementIds,
  parseRequirementDefs,
  parseTasks,
  parseWaves,
  type RegionParseContext,
} from "./roadmap-parse-regions.ts";

/** Parses the roadmap markdown into the model consumed by the checks. */
export function parseRoadmap(text: string): RoadmapParseResult {
  const lines = text.split(/\r?\n/u);
  const context: RegionParseContext = {
    references: [],
    suspicious: [],
    annotations: [],
    issues: [],
  };

  const at = {
    requirements: headingIndex(lines, "## 2."),
    critical: headingIndex(lines, "## 3."),
    ledger: headingIndex(lines, "### 3.1"),
    tasks: headingIndex(lines, "## 4."),
    waves: headingIndex(lines, "## 9."),
    matrix: headingIndex(lines, "## 10."),
    changes: headingIndex(lines, "## 11."),
  };
  const order = [
    ["requirements", at.requirements],
    ["critical", at.critical],
    ["ledger", at.ledger],
    ["tasks", at.tasks],
    ["waves", at.waves],
    ["matrix", at.matrix],
    ["changes", at.changes],
  ] as const;
  const issues: ParseIssue[] = [];
  for (const [name, index] of order) {
    if (index < 0) {
      issues.push(Object.freeze({ line: 1, message: `缺少必需章节：${name}` }));
    }
  }
  if (issues.length > 0) {
    return Object.freeze({
      model: emptyModel(),
      issues: Object.freeze(issues),
    });
  }
  const region = (name: string, start: number, end: number): Region =>
    Object.freeze({ name, start, end });
  const requirementsRegion = region("requirements", at.requirements, at.critical);
  const criticalRegion = region("critical", at.critical, at.ledger);
  const ledgerRegion = region("ledger", at.ledger, at.tasks);
  const tasksRegion = region("tasks", at.tasks, at.waves);
  const wavesRegion = region("waves", at.waves, at.matrix);
  const matrixRegion = region("matrix", at.matrix, at.changes);

  const requirementDefs = parseRequirementDefs(lines, requirementsRegion, context);
  const ledger = parseLedger(lines, ledgerRegion, context);
  const tasks = parseTasks(lines, tasksRegion, context);
  const criticalEdges = parseCriticalPath(lines, criticalRegion, context);
  const { waves, waveGroups } = parseWaves(lines, wavesRegion, context);
  const matrixRequirementIds = parseMatrixRequirementIds(lines, matrixRegion, context);

  const dependencyEdges = tasks.reduce(
    (sum, task) => sum + task.dependencies.length,
    0,
  );
  return Object.freeze({
    model: Object.freeze({
      tasks,
      ledger,
      criticalEdges,
      waves,
      waveGroups,
      requirementDefs,
      matrixRequirementIds,
      idReferences: Object.freeze(context.references),
      suspiciousTokens: Object.freeze(context.suspicious),
      requirementAnnotations: Object.freeze(context.annotations),
      counts: Object.freeze({
        tasks: tasks.length,
        dependencyEdges,
        requirementIds: requirementDefs.length,
        ledgerEntries: ledger.length,
        criticalPathEdges: criticalEdges.length,
        waveGroups: waveGroups.length,
      }),
    }),
    issues: Object.freeze(context.issues),
  });
}

function emptyModel(): RoadmapParseResult["model"] {
  return Object.freeze({
    tasks: Object.freeze([]),
    ledger: Object.freeze([]),
    criticalEdges: Object.freeze([]),
    waves: Object.freeze([]),
    waveGroups: Object.freeze([]),
    requirementDefs: Object.freeze([]),
    matrixRequirementIds: Object.freeze([]),
    idReferences: Object.freeze([]),
    suspiciousTokens: Object.freeze([]),
    requirementAnnotations: Object.freeze([]),
    counts: Object.freeze({
      tasks: 0,
      dependencyEdges: 0,
      requirementIds: 0,
      ledgerEntries: 0,
      criticalPathEdges: 0,
      waveGroups: 0,
    }),
  });
}
