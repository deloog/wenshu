/**
 * Structural checks 1~3: task-ID integrity/uniqueness, dependency
 * acyclicity, and ledger status monotonicity (with the registered
 * deviation table as the only exemption source).
 */
import type { QualityFinding } from "./guardrails.ts";
import type { RoadmapModel } from "./roadmap-model.ts";
import type { RoadmapRegistry } from "./roadmap-registry.ts";

function finding(
  rule: string,
  filePath: string,
  line: number,
  message: string,
): QualityFinding {
  return Object.freeze({ rule, severity: "error", filePath, line, message });
}

function dependencyMap(model: RoadmapModel): ReadonlyMap<string, readonly string[]> {
  return new Map(model.tasks.map((task) => [task.id, task.dependencies]));
}

/** Check 1a/1b/1c: ID uniqueness, resolvable references, typo suspects. */
export function checkTaskIdentity(
  model: RoadmapModel,
  filePath: string,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  const seen = new Map<string, number>();
  for (const task of model.tasks) {
    const firstLine = seen.get(task.id);
    if (firstLine !== undefined) {
      findings.push(
        finding(
          "roadmap-id-duplicate",
          filePath,
          task.line,
          `任务 ID "${task.id}" 重复定义（首次在第 ${firstLine} 行）`,
        ),
      );
    } else {
      seen.set(task.id, task.line);
    }
  }
  const defined = new Set(model.tasks.map((task) => task.id));
  for (const reference of model.idReferences) {
    if (!defined.has(reference.id)) {
      findings.push(
        finding(
          "roadmap-id-unknown",
          filePath,
          reference.line,
          `${reference.position}引用了未定义的任务 ID "${reference.id}"`,
        ),
      );
    }
  }
  for (const token of model.suspiciousTokens) {
    findings.push(
      finding(
        "roadmap-id-suspicious",
        filePath,
        token.line,
        `${token.position}出现形如任务 ID 但未定义的 token "${token.token}"（疑似拼错，会被静默丢弃）`,
      ),
    );
  }
  return Object.freeze(findings);
}

/** Check 2: the direct-dependency graph must be acyclic. */
export function checkDependencyCycles(
  model: RoadmapModel,
  filePath: string,
): readonly QualityFinding[] {
  const deps = dependencyMap(model);
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (id: string): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      cycles.push([...stack.slice(stack.indexOf(id)), id]);
      return;
    }
    state.set(id, "visiting");
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      if (deps.has(dep)) visit(dep);
    }
    stack.pop();
    state.set(id, "done");
  };
  for (const task of model.tasks) visit(task.id);
  const lineOf = new Map(model.tasks.map((task) => [task.id, task.line]));
  return Object.freeze(
    cycles.map((cycle) =>
      finding(
        "roadmap-dependency-cycle",
        filePath,
        lineOf.get(cycle[0] ?? "") ?? 1,
        `依赖存在环：${cycle.join(" → ")}`,
      ),
    ),
  );
}

/** Check 3: a completed task's direct dependencies must be completed. */
export function checkLedgerMonotonicity(
  model: RoadmapModel,
  registry: RoadmapRegistry,
  filePath: string,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  const statusById = new Map(model.ledger.map((row) => [row.id, row.status]));
  const lineById = new Map(model.ledger.map((row) => [row.id, row.line]));
  const deps = dependencyMap(model);
  const isApproved = (task: string, dep: string): boolean =>
    registry.approvedDeviations.some(
      (entry) => entry.task === task && entry.unmetDependency === dep,
    );
  for (const row of model.ledger) {
    if (!row.status.includes("✅")) continue;
    for (const dep of deps.get(row.id) ?? []) {
      const depStatus = statusById.get(dep);
      const completed = depStatus !== undefined && depStatus.includes("✅");
      if (!completed && !isApproved(row.id, dep)) {
        findings.push(
          finding(
            "roadmap-status-nonmonotonic",
            filePath,
            row.line,
            `${row.id} 已标记完成，但其直接依赖 ${dep} 的状态为 "${depStatus ?? "(台账无条目)"}"，且未登记已批准偏离`,
          ),
        );
      }
    }
  }
  for (const entry of registry.approvedDeviations) {
    const taskStatus = statusById.get(entry.task) ?? "";
    const depStatus = statusById.get(entry.unmetDependency) ?? "";
    const live =
      taskStatus.includes("✅") &&
      !depStatus.includes("✅") &&
      (deps.get(entry.task) ?? []).includes(entry.unmetDependency);
    if (!live) {
      findings.push(
        finding(
          "roadmap-registry-stale",
          filePath,
          lineById.get(entry.task) ?? 1,
          `已批准偏离登记 "${entry.task} / ${entry.unmetDependency}" 与现状不符，须更新登记表`,
        ),
      );
    }
  }
  return Object.freeze(findings);
}
