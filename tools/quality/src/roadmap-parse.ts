/**
 * Fail-closed parser for docs/implementation-roadmap.md.
 *
 * Parsing markdown tables can silently degrade to "0 tasks, 0 edges" when
 * the format changes, at which point every invariant would "pass". This
 * parser therefore reports every table row it cannot parse inside the
 * structural regions, requires the declared sections to exist, and emits
 * the parse counts that the gate compares against registered floors.
 */
import {
  headingIndex,
  isHeaderRow,
  linksOf,
  tableRows,
  type Region,
} from "./roadmap-markdown.ts";
import {
  extractRequirementIds,
  extractSuspiciousIdTokens,
  extractTaskIds,
  REQUIREMENT_ID_PATTERN,
  TASK_ID_PATTERN,
  type CriticalEdge,
  type IdReference,
  type LedgerRow,
  type ParseIssue,
  type RequirementAnnotation,
  type RoadmapParseResult,
  type SuspiciousIdToken,
  type TaskRow,
  type WaveGroup,
} from "./roadmap-model.ts";

const WAVE_PATTERN = /^W\d+$/u;

function collectReferences(
  target: IdReference[],
  suspicious: SuspiciousIdToken[],
  text: string,
  line: number,
  position: string,
): void {
  for (const id of extractTaskIds(text)) {
    target.push(Object.freeze({ id, line, position }));
  }
  for (const token of extractSuspiciousIdTokens(text)) {
    suspicious.push(Object.freeze({ token, line, position }));
  }
}

/** Parses the roadmap markdown into the model consumed by the checks. */
export function parseRoadmap(text: string): RoadmapParseResult {
  const lines = text.split(/\r?\n/u);
  const issues: ParseIssue[] = [];
  const references: IdReference[] = [];
  const suspicious: SuspiciousIdToken[] = [];
  const annotations: RequirementAnnotation[] = [];

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

  const requirementDefs: string[] = [];
  for (const row of tableRows(lines, requirementsRegion)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["ID"])) continue;
    if (!REQUIREMENT_ID_PATTERN.test(first)) {
      issues.push(
        Object.freeze({
          line: row.line,
          message: `§2 需求表行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    requirementDefs.push(first);
  }

  const ledger: LedgerRow[] = [];
  for (const row of tableRows(lines, ledgerRegion)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["任务"])) continue;
    if (!TASK_ID_PATTERN.test(first) || row.cells.length < 3) {
      issues.push(
        Object.freeze({
          line: row.line,
          message: `§3.1 台账行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    references.push(
      Object.freeze({ id: first, line: row.line, position: "§3.1 台账条目" }),
    );
    ledger.push(
      Object.freeze({
        id: first,
        line: row.line,
        status: row.cells[1] ?? "",
        links: linksOf(lines[row.line - 1] ?? ""),
      }),
    );
  }

  const tasks: TaskRow[] = [];
  for (const row of tableRows(lines, tasksRegion)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["ID"])) continue;
    if (!TASK_ID_PATTERN.test(first) || row.cells.length < 3) {
      issues.push(
        Object.freeze({
          line: row.line,
          message: `§4~§8 任务表行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    const relation = row.cells[2] ?? "";
    const arrow = relation.indexOf("→");
    if (arrow < 0) {
      issues.push(
        Object.freeze({ line: row.line, message: `任务 ${first} 的依赖列缺少 "→"` }),
      );
      continue;
    }
    const dependencies = extractTaskIds(relation.slice(0, arrow));
    const consumers = extractTaskIds(relation.slice(arrow + 1));
    collectReferences(
      references,
      suspicious,
      relation.slice(0, arrow),
      row.line,
      "依赖列",
    );
    collectReferences(
      references,
      suspicious,
      relation.slice(arrow + 1),
      row.line,
      "消费者列",
    );
    for (const id of extractRequirementIds(row.cells[1] ?? "")) {
      annotations.push(
        Object.freeze({ id, line: row.line, position: "任务 R-* 标注" }),
      );
    }
    tasks.push(
      Object.freeze({
        id: first,
        line: row.line,
        dependencies,
        consumers,
        requirementIds: extractRequirementIds(row.cells[1] ?? ""),
      }),
    );
  }

  const criticalEdges = parseCriticalPath(
    lines,
    criticalRegion,
    references,
    suspicious,
    issues,
  );

  const waves: { wave: string; line: number }[] = [];
  const waveGroups: WaveGroup[] = [];
  for (const row of tableRows(lines, wavesRegion)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["波次"])) continue;
    if (!WAVE_PATTERN.test(first) || row.cells.length < 2) {
      issues.push(
        Object.freeze({
          line: row.line,
          message: `§9 波次表行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    waves.push(Object.freeze({ wave: first, line: row.line }));
    // 全角括号注记（如“（待 G1-10 冻结后）”）是时序说明，不参与组成员判定。
    const groupCell = (row.cells[1] ?? "").replaceAll(/（[^（）]*）/gu, "");
    collectReferences(references, suspicious, groupCell, row.line, "§9 波次");
    for (const segment of groupCell.split("；")) {
      const ids = extractTaskIds(segment);
      if (ids.length >= 2) {
        waveGroups.push(Object.freeze({ wave: first, line: row.line, taskIds: ids }));
      }
    }
  }

  const matrixRequirementIds: string[] = [];
  for (const row of tableRows(lines, matrixRegion)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["要求"])) continue;
    const ids = extractRequirementIds(first);
    if (ids.length === 0 || row.cells.length < 3) {
      issues.push(
        Object.freeze({
          line: row.line,
          message: `§10 矩阵行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    matrixRequirementIds.push(...ids);
    collectReferences(
      references,
      suspicious,
      `${row.cells[1] ?? ""} ${row.cells[2] ?? ""}`,
      row.line,
      "§10 矩阵",
    );
  }

  const dependencyEdges = tasks.reduce(
    (sum, task) => sum + task.dependencies.length,
    0,
  );
  return Object.freeze({
    model: Object.freeze({
      tasks: Object.freeze(tasks),
      ledger: Object.freeze(ledger),
      criticalEdges,
      waves: Object.freeze(waves),
      waveGroups: Object.freeze(waveGroups),
      requirementDefs: Object.freeze(requirementDefs),
      matrixRequirementIds: Object.freeze(matrixRequirementIds),
      idReferences: Object.freeze(references),
      suspiciousTokens: Object.freeze(suspicious),
      requirementAnnotations: Object.freeze(annotations),
      counts: Object.freeze({
        tasks: tasks.length,
        dependencyEdges,
        requirementIds: requirementDefs.length,
        ledgerEntries: ledger.length,
        criticalPathEdges: criticalEdges.length,
        waveGroups: waveGroups.length,
      }),
    }),
    issues: Object.freeze(issues),
  });
}

function parseCriticalPath(
  lines: readonly string[],
  region: Region,
  references: IdReference[],
  suspicious: SuspiciousIdToken[],
  issues: ParseIssue[],
): readonly CriticalEdge[] {
  const edges: CriticalEdge[] = [];
  let inFence = false;
  let fenceSeen = false;
  for (let index = region.start; index < region.end; index++) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      inFence = !inFence;
      fenceSeen = true;
      continue;
    }
    if (!inFence) continue;
    collectReferences(references, suspicious, line, index + 1, "§3 关键路径");
    for (const chain of line.split("；")) {
      const parts = chain.split("→");
      for (let part = 0; part + 1 < parts.length; part++) {
        const left = extractTaskIds(parts[part] ?? "");
        const right = extractTaskIds(parts[part + 1] ?? "");
        const from = left[left.length - 1];
        const to = right[0];
        if (from !== undefined && to !== undefined) {
          edges.push(Object.freeze({ from, to, line: index + 1 }));
        }
      }
    }
  }
  if (!fenceSeen) {
    issues.push(
      Object.freeze({ line: region.start + 1, message: "§3 缺少关键路径代码块" }),
    );
  }
  return Object.freeze(edges);
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
