/**
 * Consistency checks 4~7: requirement coverage, critical-path basis,
 * parallel-wave conflicts, and consumer-column truthfulness. These treat
 * §3/§9/§10 and the consumer column as derived objects verified against
 * the handwritten dependency column — never as parallel sources of truth.
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

/** Check 4: annotations must be defined in §2; every §2 ID appears in §10. */
export function checkRequirementCoverage(
  model: RoadmapModel,
  filePath: string,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  const defined = new Set(model.requirementDefs);
  for (const annotation of model.requirementAnnotations) {
    if (!defined.has(annotation.id)) {
      findings.push(
        finding(
          "roadmap-requirement-undefined",
          filePath,
          annotation.line,
          `${annotation.position}使用了 §2 未定义的 "${annotation.id}"`,
        ),
      );
    }
  }
  const inMatrix = new Set(model.matrixRequirementIds);
  for (const id of model.requirementDefs) {
    if (!inMatrix.has(id)) {
      findings.push(
        finding(
          "roadmap-requirement-uncovered",
          filePath,
          1,
          `§2 定义的 "${id}" 未在 §10 双向追踪矩阵出现`,
        ),
      );
    }
  }
  return Object.freeze(findings);
}

/** Check 5: every §3 edge must have a transitive dependency basis. */
export function checkCriticalPathBasis(
  model: RoadmapModel,
  filePath: string,
): readonly QualityFinding[] {
  const deps = dependencyMap(model);
  const closureOf = (id: string): ReadonlySet<string> => {
    const out = new Set<string>();
    const stack = [...(deps.get(id) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (!out.has(current)) {
        out.add(current);
        stack.push(...(deps.get(current) ?? []));
      }
    }
    return out;
  };
  const findings: QualityFinding[] = [];
  for (const edge of model.criticalEdges) {
    if (!closureOf(edge.to).has(edge.from)) {
      findings.push(
        finding(
          "roadmap-critical-edge-unfounded",
          filePath,
          edge.line,
          `§3 关键路径边 ${edge.from} → ${edge.to} 在依赖列中没有任何传递依赖依据`,
        ),
      );
    }
  }
  return Object.freeze(findings);
}

/** Check 6: a parallel group must not contain a task and its direct dependency. */
export function checkWaveConflicts(
  model: RoadmapModel,
  registry: RoadmapRegistry,
  filePath: string,
): readonly QualityFinding[] {
  const deps = dependencyMap(model);
  const historical = new Set(registry.historicalWaves);
  const findings: QualityFinding[] = [];
  for (const wave of registry.historicalWaves) {
    if (!model.waves.some((entry) => entry.wave === wave)) {
      findings.push(
        finding(
          "roadmap-registry-stale",
          filePath,
          1,
          `历史波次登记 "${wave}" 在 §9 中不存在，须更新登记表`,
        ),
      );
    }
  }
  for (const group of model.waveGroups) {
    if (historical.has(group.wave)) continue;
    for (const member of group.taskIds) {
      for (const other of group.taskIds) {
        if (member !== other && (deps.get(other) ?? []).includes(member)) {
          findings.push(
            finding(
              "roadmap-wave-dependency-conflict",
              filePath,
              group.line,
              `§9 ${group.wave} 可并行组同时包含 ${member} 与其直接下游 ${other}（${other} 直接依赖 ${member}）`,
            ),
          );
        }
      }
    }
  }
  return Object.freeze(findings);
}

/** Check 7: declared consumers must be a subset of real transitive downstreams. */
export function checkConsumerTruthfulness(
  model: RoadmapModel,
  filePath: string,
): readonly QualityFinding[] {
  const defined = new Set(model.tasks.map((task) => task.id));
  const dependents = new Map<string, string[]>();
  for (const task of model.tasks) {
    for (const dep of task.dependencies) {
      const list = dependents.get(dep) ?? [];
      list.push(task.id);
      dependents.set(dep, list);
    }
  }
  const downstreamOf = (id: string): ReadonlySet<string> => {
    const out = new Set<string>();
    const stack = [...(dependents.get(id) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (!out.has(current)) {
        out.add(current);
        stack.push(...(dependents.get(current) ?? []));
      }
    }
    return out;
  };
  const findings: QualityFinding[] = [];
  for (const task of model.tasks) {
    const downstream = downstreamOf(task.id);
    for (const consumer of task.consumers) {
      if (!defined.has(consumer)) continue; // reported by check 1b
      if (!downstream.has(consumer)) {
        findings.push(
          finding(
            "roadmap-consumer-unfounded",
            filePath,
            task.line,
            `${task.id} 的消费者列声明了 ${consumer}，但依赖链中 ${consumer} 并不传递依赖 ${task.id}`,
          ),
        );
      }
    }
  }
  return Object.freeze(findings);
}
