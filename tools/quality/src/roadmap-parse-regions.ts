/**
 * Per-region row parsers for docs/implementation-roadmap.md.
 *
 * Each function parses one structural region of the roadmap into model
 * fragments. Unparseable rows and ID references found in structural
 * positions are reported through the shared context so that the gate
 * stays fail-closed (see roadmap-parse.ts for the orchestrator).
 */
import { isHeaderRow, linksOf, tableRows, type Region } from "./roadmap-markdown.ts";
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
  type SuspiciousIdToken,
  type TaskRow,
  type WaveGroup,
} from "./roadmap-model.ts";

const WAVE_PATTERN = /^W\d+$/u;

/** Shared mutable collectors threaded through every region parser. */
export interface RegionParseContext {
  readonly references: IdReference[];
  readonly suspicious: SuspiciousIdToken[];
  readonly annotations: RequirementAnnotation[];
  readonly issues: ParseIssue[];
}

function collectReferences(
  context: RegionParseContext,
  text: string,
  line: number,
  position: string,
): void {
  for (const id of extractTaskIds(text)) {
    context.references.push(Object.freeze({ id, line, position }));
  }
  for (const token of extractSuspiciousIdTokens(text)) {
    context.suspicious.push(Object.freeze({ token, line, position }));
  }
}

/** §2 requirement table → declared requirement IDs. */
export function parseRequirementDefs(
  lines: readonly string[],
  region: Region,
  context: RegionParseContext,
): readonly string[] {
  const requirementDefs: string[] = [];
  for (const row of tableRows(lines, region)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["ID"])) continue;
    if (!REQUIREMENT_ID_PATTERN.test(first)) {
      context.issues.push(
        Object.freeze({
          line: row.line,
          message: `§2 需求表行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    requirementDefs.push(first);
  }
  return Object.freeze(requirementDefs);
}

/** §3.1 audit ledger table → ledger rows with markdown links. */
export function parseLedger(
  lines: readonly string[],
  region: Region,
  context: RegionParseContext,
): readonly LedgerRow[] {
  const ledger: LedgerRow[] = [];
  for (const row of tableRows(lines, region)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["任务"])) continue;
    if (!TASK_ID_PATTERN.test(first) || row.cells.length < 3) {
      context.issues.push(
        Object.freeze({
          line: row.line,
          message: `§3.1 台账行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    context.references.push(
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
  return Object.freeze(ledger);
}

/** §4~§8 task tables → task rows with dependency/consumer columns. */
export function parseTasks(
  lines: readonly string[],
  region: Region,
  context: RegionParseContext,
): readonly TaskRow[] {
  const tasks: TaskRow[] = [];
  for (const row of tableRows(lines, region)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["ID"])) continue;
    if (!TASK_ID_PATTERN.test(first) || row.cells.length < 3) {
      context.issues.push(
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
      context.issues.push(
        Object.freeze({ line: row.line, message: `任务 ${first} 的依赖列缺少 "→"` }),
      );
      continue;
    }
    const dependencies = extractTaskIds(relation.slice(0, arrow));
    const consumers = extractTaskIds(relation.slice(arrow + 1));
    collectReferences(context, relation.slice(0, arrow), row.line, "依赖列");
    collectReferences(context, relation.slice(arrow + 1), row.line, "消费者列");
    const requirementIds = extractRequirementIds(row.cells[1] ?? "");
    for (const id of requirementIds) {
      context.annotations.push(
        Object.freeze({ id, line: row.line, position: "任务 R-* 标注" }),
      );
    }
    tasks.push(
      Object.freeze({
        id: first,
        line: row.line,
        dependencies,
        consumers,
        requirementIds,
      }),
    );
  }
  return Object.freeze(tasks);
}

/** §9 wave table → wave rows plus parallel groups (≥2 tasks per segment). */
export function parseWaves(
  lines: readonly string[],
  region: Region,
  context: RegionParseContext,
): {
  readonly waves: readonly { wave: string; line: number }[];
  readonly waveGroups: readonly WaveGroup[];
} {
  const waves: { wave: string; line: number }[] = [];
  const waveGroups: WaveGroup[] = [];
  for (const row of tableRows(lines, region)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["波次"])) continue;
    if (!WAVE_PATTERN.test(first) || row.cells.length < 2) {
      context.issues.push(
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
    collectReferences(context, groupCell, row.line, "§9 波次");
    for (const segment of groupCell.split("；")) {
      const ids = extractTaskIds(segment);
      if (ids.length >= 2) {
        waveGroups.push(Object.freeze({ wave: first, line: row.line, taskIds: ids }));
      }
    }
  }
  return Object.freeze({
    waves: Object.freeze(waves),
    waveGroups: Object.freeze(waveGroups),
  });
}

/** §10 bidirectional traceability matrix → referenced requirement IDs. */
export function parseMatrixRequirementIds(
  lines: readonly string[],
  region: Region,
  context: RegionParseContext,
): readonly string[] {
  const matrixRequirementIds: string[] = [];
  for (const row of tableRows(lines, region)) {
    const first = row.cells[0] ?? "";
    if (isHeaderRow(row.cells, ["要求"])) continue;
    const ids = extractRequirementIds(first);
    if (ids.length === 0 || row.cells.length < 3) {
      context.issues.push(
        Object.freeze({
          line: row.line,
          message: `§10 矩阵行无法解析：第 1 列 "${first}"`,
        }),
      );
      continue;
    }
    matrixRequirementIds.push(...ids);
    collectReferences(
      context,
      `${row.cells[1] ?? ""} ${row.cells[2] ?? ""}`,
      row.line,
      "§10 矩阵",
    );
  }
  return Object.freeze(matrixRequirementIds);
}

/** §3 critical-path ASCII block → edges between adjacent chain IDs. */
export function parseCriticalPath(
  lines: readonly string[],
  region: Region,
  context: RegionParseContext,
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
    collectReferences(context, line, index + 1, "§3 关键路径");
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
    context.issues.push(
      Object.freeze({ line: region.start + 1, message: "§3 缺少关键路径代码块" }),
    );
  }
  return Object.freeze(edges);
}
