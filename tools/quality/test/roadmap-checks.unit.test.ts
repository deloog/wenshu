import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  checkConsumerTruthfulness,
  checkCriticalPathBasis,
  checkRequirementCoverage,
  checkWaveConflicts,
} from "../src/roadmap-checks-consistency.ts";
import {
  allowedReportsForTask,
  checkLedgerEvidence,
} from "../src/roadmap-checks-evidence.ts";
import {
  checkDependencyCycles,
  checkLedgerMonotonicity,
  checkTaskIdentity,
} from "../src/roadmap-checks-structure.ts";
import type { RoadmapModel } from "../src/roadmap-model.ts";
import { ROADMAP_REGISTRY } from "../src/roadmap-registry.ts";

const FILE = "docs/implementation-roadmap.md";

function model(overrides: Partial<RoadmapModel>): RoadmapModel {
  const empty = Object.freeze({
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
  return Object.freeze({ ...empty, ...overrides }) as RoadmapModel;
}

function task(id: string, dependencies: string[] = [], consumers: string[] = []) {
  return Object.freeze({ id, line: 1, dependencies, consumers, requirementIds: [] });
}

test("1a/1b/1c: duplicates, unknown references, suspicious tokens", () => {
  const m = model({
    tasks: Object.freeze([task("G1-01"), task("G1-01")]),
    idReferences: Object.freeze([
      Object.freeze({ id: "PB-19", line: 7, position: "依赖列" }),
    ]),
    suspiciousTokens: Object.freeze([
      Object.freeze({ token: "PB-O9", line: 9, position: "依赖列" }),
    ]),
  });
  const rules = checkTaskIdentity(m, FILE).map((f) => f.rule);
  assert.deepEqual(rules, [
    "roadmap-id-duplicate",
    "roadmap-id-unknown",
    "roadmap-id-suspicious",
  ]);
});

test("2: dependency cycles are reported with the cycle path", () => {
  const m = model({
    tasks: Object.freeze([task("A-01", ["A-02"]), task("A-02", ["A-01"])]),
  });
  const findings = checkDependencyCycles(m, FILE);
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? "", /A-0[12] → A-0[12] → A-0[12]/);
});

test("3: non-monotonic status fails unless the deviation is registered", () => {
  const m = model({
    tasks: Object.freeze([task("PA-15", ["PA-14U"])]),
    ledger: Object.freeze([
      Object.freeze({ id: "PA-15", line: 3, status: "✅ 已完成", links: [] }),
      Object.freeze({ id: "PA-14U", line: 4, status: "⏸ 已后置", links: [] }),
    ]),
  });
  assert.equal(checkLedgerMonotonicity(m, emptyRegistry(), FILE).length, 1);
  assert.equal(checkLedgerMonotonicity(m, deviationRegistry(), FILE).length, 0);
});

test("3: a registered deviation that no longer matches reality is stale", () => {
  const m = model({
    tasks: Object.freeze([task("PA-15", ["PA-14U"])]),
    ledger: Object.freeze([
      Object.freeze({ id: "PA-15", line: 3, status: "✅ 已完成", links: [] }),
      Object.freeze({ id: "PA-14U", line: 4, status: "✅ 已完成", links: [] }),
    ]),
  });
  const findings = checkLedgerMonotonicity(m, deviationRegistry(), FILE);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.rule, "roadmap-registry-stale");
});

test("4: undefined annotations and uncovered §2 IDs are both caught", () => {
  const m = model({
    requirementDefs: Object.freeze(["R-TEST", "R-SEC"]),
    matrixRequirementIds: Object.freeze(["R-TEST"]),
    requirementAnnotations: Object.freeze([
      Object.freeze({ id: "R-FAKE", line: 5, position: "任务 R-* 标注" }),
    ]),
  });
  const rules = checkRequirementCoverage(m, FILE).map((f) => f.rule);
  assert.deepEqual(rules, [
    "roadmap-requirement-undefined",
    "roadmap-requirement-uncovered",
  ]);
});

test("5: transitive basis passes, unfounded edges fail", () => {
  const m = model({
    tasks: Object.freeze([
      task("G1-04"),
      task("G1-08", ["G1-04"]),
      task("G1-10", ["G1-08"]),
    ]),
    criticalEdges: Object.freeze([
      Object.freeze({ from: "G1-04", to: "G1-10", line: 8 }),
      Object.freeze({ from: "G1-10", to: "G1-04", line: 9 }),
    ]),
  });
  const findings = checkCriticalPathBasis(m, FILE);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.line, 9);
});

test("6: historical waves are exempt; other waves fail on direct dependency", () => {
  const group = (wave: string) =>
    Object.freeze({ wave, line: 2, taskIds: Object.freeze(["G1-10", "G1-13"]) });
  const m = model({
    tasks: Object.freeze([task("G1-10"), task("G1-13", ["G1-10"])]),
    waves: Object.freeze([
      Object.freeze({ wave: "W1", line: 2 }),
      Object.freeze({ wave: "W2", line: 3 }),
    ]),
    waveGroups: Object.freeze([group("W1"), group("W2")]),
  });
  const findings = checkWaveConflicts(m, ROADMAP_REGISTRY, FILE);
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? "", /W2/);
});

test("7: consumers must be real transitive downstreams", () => {
  const m = model({
    tasks: Object.freeze([
      task("G1-06", [], ["PB-10", "G1-09"]),
      task("G1-09", ["G1-03"]),
      task("PB-09", [], []),
      task("PB-10", ["PB-09"]),
      task("G1-03"),
    ]),
  });
  // G1-06 -> PB-10 is not downstream either; use a real chain instead.
  const m2 = model({
    tasks: Object.freeze([
      task("G1-06", [], ["PB-10", "G1-09"]),
      task("G1-09", ["G1-03"]),
      task("G1-03"),
      task("PB-10", ["G1-06"]),
    ]),
  });
  assert.equal(checkConsumerTruthfulness(m, FILE).length, 2);
  const findings = checkConsumerTruthfulness(m2, FILE);
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? "", /G1-09/);
});

function emptyRegistry() {
  return Object.freeze({
    ...ROADMAP_REGISTRY,
    approvedDeviations: Object.freeze([]),
  });
}

function deviationRegistry() {
  return Object.freeze({
    ...ROADMAP_REGISTRY,
    approvedDeviations: Object.freeze([
      Object.freeze({ task: "PA-15", unmetDependency: "PA-14U", basis: "测试" }),
    ]),
  });
}

test("8b alias map is derived from the exception table, not copied", () => {
  assert.deepEqual(allowedReportsForTask("G1-04", ROADMAP_REGISTRY), [
    "G1-04-claude-audit-report.md",
    "G1-03-to-G1-06-claude-audit-report.md",
  ]);
  assert.deepEqual(allowedReportsForTask("PA-11", ROADMAP_REGISTRY), [
    "PA-11-claude-audit-report.md",
    "PA-11A-claude-audit-report.md",
    "PA-11B-claude-audit-report.md",
  ]);
  assert.deepEqual(allowedReportsForTask("PA-01", ROADMAP_REGISTRY), [
    "PA-01-claude-audit-report.md",
  ]);
});

test("8a/8b/8c run real directory listing and link resolution", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-g204-unit-"));
  try {
    const docs = join(root, "docs");
    const audits = join(docs, "audits");
    await mkdir(audits, { recursive: true });
    await writeFile(join(audits, "G2-03-claude-audit-report.md"), "", "utf8");
    await writeFile(join(audits, "PA-07-claude-audit-report.md"), "", "utf8");
    const m = model({
      ledger: Object.freeze([
        Object.freeze({
          id: "PA-07",
          line: 3,
          status: "✅ 已完成",
          links: Object.freeze(["audits/PA-07-claude-audit-report.md", "missing.md"]),
        }),
      ]),
    });
    const registry = Object.freeze({
      ...ROADMAP_REGISTRY,
      auditReportExceptions: Object.freeze([]),
      ledgerRowsWithoutIndependentReport: Object.freeze([]),
    });
    const findings = await checkLedgerEvidence(m, registry, docs, audits, FILE);
    const rules = findings.map((f) => f.rule);
    assert.ok(rules.includes("roadmap-audit-report-without-ledger")); // G2-03 has no ledger row
    assert.ok(rules.includes("roadmap-ledger-broken-link")); // missing.md
    assert.ok(!rules.includes("roadmap-ledger-missing-report-link")); // PA-07 links its report
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
