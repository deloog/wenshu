/**
 * G2-04 counterexample matrix — the 18 cases that must FAIL.
 * Each case mutates one real-file copy inside a mirror workspace and runs
 * the real gate; every failure message must name the violated rule and
 * the violating location. Cases are independent: one mirror each.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { QualityFinding } from "../src/guardrails.ts";
import {
  checkRoadmapInvariants,
  formatRoadmapCounts,
} from "../src/roadmap-invariants.ts";
import { ROADMAP_REGISTRY, type RoadmapRegistry } from "../src/roadmap-registry.ts";
import { makeMirror, replaceOnce } from "./roadmap-mirror.ts";

async function runCase(
  mutate: (text: string) => string,
  options?: { extraAuditFiles?: readonly string[]; registry?: RoadmapRegistry },
): Promise<readonly QualityFinding[]> {
  const mirror = await makeMirror(mutate, options);
  try {
    const result = await checkRoadmapInvariants(
      mirror.roadmapPath,
      options?.registry ?? ROADMAP_REGISTRY,
    );
    console.log(formatRoadmapCounts(result));
    return result.findings;
  } finally {
    await mirror.cleanup();
  }
}

function assertViolation(
  findings: readonly QualityFinding[],
  rule: string,
  location: RegExp,
): void {
  const hit = findings.find(
    (finding) => finding.rule === rule && location.test(finding.message),
  );
  assert.ok(
    hit,
    `expected ${rule} matching ${location} in:\n${findings
      .map((f) => `${f.rule}:${f.line} ${f.message}`)
      .join("\n")}`,
  );
  console.log(`  observed: ${hit.rule}:${hit.line} ${hit.message}`);
}

test("#1 依赖列制造环 → roadmap-dependency-cycle", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "| PB-02 | 实现稳定 ID 的最小文档编辑操作。R-ID/R-TX | G1-04,PB-01 → PB-03/04 |",
      "| PB-02 | 实现稳定 ID 的最小文档编辑操作。R-ID/R-TX | G1-04,PB-01,PB-12 → PB-03/04 |",
    ),
  );
  assertViolation(findings, "roadmap-dependency-cycle", /PB-02.*PB-12/);
});

test("#2 ✅ 任务的依赖改为未完成且不登记偏离 → roadmap-status-nonmonotonic", async () => {
  const findings = await runCase((text) =>
    replaceOnce(text, "| PB-08 | ✅ 已完成 |", "| PB-08 | ⏸ 已后置 |"),
  );
  assertViolation(findings, "roadmap-status-nonmonotonic", /PB-09.*PB-08/);
});

test("#4 登记表删去 PA-15 偏离条目 → roadmap-status-nonmonotonic", async () => {
  const registry = Object.freeze({
    ...ROADMAP_REGISTRY,
    approvedDeviations: Object.freeze([]),
  });
  const findings = await runCase((text) => text, { registry });
  assertViolation(findings, "roadmap-status-nonmonotonic", /PA-15.*PA-14U/);
});

test("#5 任务标注 §2 未定义的 R-FAKE → roadmap-requirement-undefined", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "建立本地 Git 基线与忽略规则。R-TEST/R-SEC",
      "建立本地 Git 基线与忽略规则。R-TEST/R-SEC/R-FAKE",
    ),
  );
  assertViolation(findings, "roadmap-requirement-undefined", /R-FAKE/);
});

test("#6 删除 R-PERF 的 §10 出现 → roadmap-requirement-uncovered", async () => {
  const findings = await runCase((text) =>
    replaceOnce(text, "| R-PERF | G1-14、PA-13、A-14 | PA-15、A-16 |\n", ""),
  );
  assertViolation(findings, "roadmap-requirement-uncovered", /R-PERF/);
});

test("#8 §3 画一条无依赖依据的边 → roadmap-critical-edge-unfounded", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "Alpha：A-01 → A-04 → A-08 → A-12 → A-16",
      "Alpha：A-01 → A-04 → A-08 → A-12 → A-16 → PB-12",
    ),
  );
  assertViolation(findings, "roadmap-critical-edge-unfounded", /A-16 → PB-12/);
});

test("#10 §9 组内加入任务与其直接依赖 → roadmap-wave-dependency-conflict", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "PA-02与PA-03；PA-07/08/09/10；",
      "PA-02与PA-03；PA-06/07/08/09/10；",
    ),
  );
  assertViolation(findings, "roadmap-wave-dependency-conflict", /PA-06.*PA-07/);
});

test("#12 §10 引用不存在的任务 ID → roadmap-id-unknown", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "G1-16、G2-03、G2-04、PA-12/13/15、PB-12、A-12",
      "G1-16、G2-03、G2-04、PA-12/13/15、PB-99、A-12",
    ),
  );
  assertViolation(findings, "roadmap-id-unknown", /§10 矩阵.*PB-99/);
});

test("#13 消费者列声明依赖链中不存在的下游 → roadmap-consumer-unfounded", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "| PA-06 | 提取 PDF 页面、文本与几何证据模型。R-PDF/R-TEST | PA-05 → PA-07/08/09/10/11 |",
      "| PA-06 | 提取 PDF 页面、文本与几何证据模型。R-PDF/R-TEST | PA-05 → PA-07/08/09/10/11、G1-03 |",
    ),
  );
  assertViolation(findings, "roadmap-consumer-unfounded", /PA-06.*G1-03/);
});

test("#15 新增审计报告但台账无条目且未登记 → roadmap-audit-report-without-ledger", async () => {
  const findings = await runCase((text) => text, {
    extraAuditFiles: ["G3-99-claude-audit-report.md"],
  });
  assertViolation(findings, "roadmap-audit-report-without-ledger", /G3-99/);
});

test("#17 台账证据链接指向不存在的文件 → roadmap-ledger-broken-link", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "见 [审计报告](audits/G1-03-to-G1-06-claude-audit-report.md)",
      "见 [审计报告](audits/G1-03-to-G1-06-claude-audit-report-missing.md)",
    ),
  );
  assertViolation(
    findings,
    "roadmap-ledger-broken-link",
    /G1-03-to-G1-06-claude-audit-report-missing/,
  );
});

test("#18 破坏 §4 表格格式 → 计数低于下限，绝不静默通过", async () => {
  const mirror = await makeMirror((text) =>
    text
      .split("\n")
      .map((line, index, all) => {
        const section4 = all.findIndex((l) => l.startsWith("## 4."));
        const section5 = all.findIndex((l) => l.startsWith("## 5."));
        return index > section4 && index < section5 && line.startsWith("| G1-")
          ? line.slice(1)
          : line;
      })
      .join("\n"),
  );
  try {
    const result = await checkRoadmapInvariants(mirror.roadmapPath);
    console.log(formatRoadmapCounts(result));
    assert.ok(result.counts.tasks < 77, "task count must degrade visibly");
    assertViolation(result.findings, "roadmap-count-floor", /任务数/);
  } finally {
    await mirror.cleanup();
  }
});

test("#20 依赖列写入 PB-O9（字母 O）→ roadmap-id-suspicious，不被静默丢弃", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "G1-06,PB-09,G2-03 → PB-11/A-02",
      "G1-06,PB-O9,G2-03 → PB-11/A-02",
    ),
  );
  assertViolation(findings, "roadmap-id-suspicious", /PB-O9/);
});

test("#21 依赖列写入格式合法但不存在的 PB-19 → roadmap-id-unknown", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "G1-06,PB-09,G2-03 → PB-11/A-02",
      "G1-06,PB-19,G2-03 → PB-11/A-02",
    ),
  );
  assertViolation(findings, "roadmap-id-unknown", /依赖列.*PB-19/);
});

test("#22 §4~§8 出现重复任务 ID → roadmap-id-duplicate", async () => {
  const anchor =
    "| G1-01 | 建立本地 Git 基线与忽略规则。R-TEST/R-SEC | G0/GR → 全任务 |";
  const findings = await runCase((text) =>
    replaceOnce(text, anchor, `${anchor}\n${anchor}`),
  );
  assertViolation(findings, "roadmap-id-duplicate", /G1-01/);
});

test("#24 §3/§9/§10/消费者列/台账各引用一个不存在 ID → 五条 roadmap-id-unknown", async () => {
  const findings = await runCase((text) => {
    let out = replaceOnce(
      text,
      "└─ 平台工具：G1-12（DevEco）",
      "└─ 平台工具：G1-12（DevEco）→ PB-19",
    );
    out = replaceOnce(
      out,
      "PB-06与PB-07；平台 host 实现；迁移场景分片",
      "PB-06与PB-07；平台 host 实现；迁移场景分片；PB-20",
    );
    out = replaceOnce(
      out,
      "G1-16、G2-03、G2-04、PA-12/13/15、PB-12、A-12",
      "G1-16、G2-03、G2-04、PA-12/13/15、PB-21、A-12",
    );
    out = replaceOnce(
      out,
      "R-PDF/R-TEST | PA-05 → PA-07/08/09/10/11 |",
      "R-PDF/R-TEST | PA-05 → PA-07/08/09/10/11、PB-22 |",
    );
    out = replaceOnce(
      out,
      "[实施记录](audits/G2-03-implementation-record.md) |",
      "[实施记录](audits/G2-03-implementation-record.md) |\n| PB-23 | ⏸ 已后置 | 占位 |",
    );
    return out;
  });
  for (const [position, id] of [
    ["§3 关键路径", "PB-19"],
    ["§9 波次", "PB-20"],
    ["§10 矩阵", "PB-21"],
    ["消费者列", "PB-22"],
    ["§3.1 台账条目", "PB-23"],
  ] as const) {
    assertViolation(findings, "roadmap-id-unknown", new RegExp(`${position}.*${id}`));
  }
});

test("#25 删去台账行的审计报告链接 → roadmap-ledger-missing-report-link", async () => {
  const findings = await runCase((text) =>
    replaceOnce(
      text,
      "Claude 审计 [`PASS`](audits/PA-07-claude-audit-report.md)",
      "Claude 审计 `PASS`",
    ),
  );
  assertViolation(findings, "roadmap-ledger-missing-report-link", /PA-07/);
});

test("#28 豁免表删去 G1-12 → roadmap-ledger-missing-report-link（豁免确在起作用）", async () => {
  const registry = Object.freeze({
    ...ROADMAP_REGISTRY,
    ledgerRowsWithoutIndependentReport: Object.freeze(
      ROADMAP_REGISTRY.ledgerRowsWithoutIndependentReport.filter(
        (entry) => entry.task !== "G1-12",
      ),
    ),
  });
  const findings = await runCase((text) => text, { registry });
  assertViolation(findings, "roadmap-ledger-missing-report-link", /G1-12/);
});
