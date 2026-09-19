/**
 * G2-04 counterexample matrix — the 11 REVERSE cases that must PASS.
 * These are the anti-false-positive load bearers: current baselines,
 * registered exemptions, transitive-only edges, prose ID-like tokens,
 * alias links, and normal roadmap growth must all be observed passing.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  checkRoadmapInvariants,
  formatRoadmapCounts,
  type RoadmapInvariantResult,
} from "../src/roadmap-invariants.ts";
import {
  ROADMAP_REGISTRY,
  type AuditReportException,
} from "../src/roadmap-registry.ts";
import { makeMirror, replaceOnce } from "./roadmap-mirror.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const REAL_ROADMAP = resolve(workspaceRoot, "docs/implementation-roadmap.md");

let realResult: RoadmapInvariantResult;

test.before(async () => {
  realResult = await checkRoadmapInvariants(REAL_ROADMAP);
  console.log(formatRoadmapCounts(realResult));
  for (const finding of realResult.findings) {
    console.log(`  ${finding.rule}:${finding.line} ${finding.message}`);
  }
});

function noRule(rulePrefix: string): void {
  const hits = realResult.findings.filter((finding) =>
    finding.rule.startsWith(rulePrefix),
  );
  assert.deepEqual(
    hits.map((finding) => finding.message),
    [],
    `expected no ${rulePrefix} findings`,
  );
}

test("#3 PA-15/PA-14U 已登记偏离现状 → 通过", () => {
  noRule("roadmap-status-nonmonotonic");
});

test("#7 全部任务的 R-* 标注现状 → 通过", () => {
  noRule("roadmap-requirement-");
});

test("#9 §3 画一条仅传递（非直接）依赖的边 → 通过（保留摘要写法）", async () => {
  const mirror = await makeMirror((text) =>
    replaceOnce(
      text,
      "├─ 仓库主干：G1-01 → G1-01R → G1-11",
      "├─ 仓库主干：G1-01 → G1-01R → G1-11 → PA-01",
    ),
  );
  try {
    const result = await checkRoadmapInvariants(mirror.roadmapPath);
    assert.deepEqual(result.findings, []);
  } finally {
    await mirror.cleanup();
  }
});

test("#11 W1 现状（已登记历史组）→ 通过", () => {
  noRule("roadmap-wave-dependency-conflict");
});

test("#14 消费者列现状的 26 处传递下游 → 通过", () => {
  noRule("roadmap-consumer-unfounded");
});

test("#16 封闭例外表 12 条现状报告 → 通过", () => {
  noRule("roadmap-audit-report-without-ledger");
});

test("#19 正常新增一个任务与台账条目 → 通过（计数向上增长不失败）", async () => {
  const mirror = await makeMirror(
    (text) => {
      let out = replaceOnce(
        text,
        "| G3-02 | 建立最小观测、诊断导出、事故与数据生命周期流程。R-SEC/R-DATA | A-16 → 发布候选 |",
        "| G3-02 | 建立最小观测、诊断导出、事故与数据生命周期流程。R-SEC/R-DATA | A-16 → 发布候选 |\n" +
          "| G3-03 | 验证新增任务正常登记流程的占位任务。R-TEST | G1-09/11、G2-03 → 后续任务 |" +
          " [审计报告](audits/G3-03-claude-audit-report.md) | 边界 |",
      );
      out = replaceOnce(
        out,
        "[实施记录](audits/G2-03-implementation-record.md) |",
        "[实施记录](audits/G2-03-implementation-record.md) |\n" +
          "| G3-03 | ✅ 已完成 | 占位；[审计报告](audits/G3-03-claude-audit-report.md) |",
      );
      return out;
    },
    { extraAuditFiles: ["G3-03-claude-audit-report.md"] },
  );
  try {
    const result = await checkRoadmapInvariants(mirror.roadmapPath);
    console.log(formatRoadmapCounts(result));
    assert.ok(result.counts.tasks > 77 && result.counts.ledgerEntries > 50);
    assert.deepEqual(result.findings, []);
  } finally {
    await mirror.cleanup();
  }
});

test("#23 散文与证据文本中的 8 个类 ID token → 通过（1c 只在结构位置生效）", async () => {
  const text = await readFile(REAL_ROADMAP, "utf8");
  for (const token of [
    "G2-M1",
    "PA-A1",
    "PA-A5",
    "PA-A7",
    "PA-A8",
    "PA-06B",
    "PA-11A",
    "PA-11B",
  ]) {
    assert.ok(text.includes(token), `real roadmap must contain prose token ${token}`);
  }
  noRule("roadmap-id-suspicious");
});

test("#26 G1-04 行链接合并报告 G1-03-to-G1-06 → 通过（别名映射生效）", async () => {
  noRule("roadmap-ledger-missing-report-link");
  // 反证：去掉别名映射后同一行必然失败，证明是通过别名映射通过的
  const withoutAlias = Object.freeze({
    ...ROADMAP_REGISTRY,
    auditReportExceptions: Object.freeze(
      ROADMAP_REGISTRY.auditReportExceptions.map((entry): AuditReportException =>
        entry.report === "G1-03-to-G1-06"
          ? Object.freeze({ ...entry, countsAsTaskReportFor: Object.freeze([]) })
          : entry,
      ),
    ),
  });
  const mirror = await makeMirror((text) => text);
  try {
    const result = await checkRoadmapInvariants(mirror.roadmapPath, withoutAlias);
    const hit = result.findings.find(
      (finding) =>
        finding.rule === "roadmap-ledger-missing-report-link" &&
        /G1-04/.test(finding.message),
    );
    assert.ok(hit, "removing the alias must surface G1-04");
  } finally {
    await mirror.cleanup();
  }
});

test("#27 无独立报告的 6 行现状 → 通过（封闭豁免表生效）", async () => {
  noRule("roadmap-ledger-missing-report-link");
  const reports = await readdir(resolve(workspaceRoot, "docs/audits"));
  for (const entry of ROADMAP_REGISTRY.ledgerRowsWithoutIndependentReport) {
    assert.ok(
      !reports.includes(`${entry.task}-claude-audit-report.md`),
      `${entry.task} must genuinely lack an independent report`,
    );
  }
});

test("#29 3 份非任务报告未被任何台账行链接 → 通过（8b 不要求报告被链接）", async () => {
  const text = await readFile(REAL_ROADMAP, "utf8");
  const ledger = text.slice(text.indexOf("### 3.1"), text.indexOf("## 4."));
  for (const report of [
    "engine-reassessment",
    "incremental-pagination",
    "poc-a-poc-b-chain-integrity",
  ]) {
    assert.ok(!ledger.includes(`${report}-claude-audit-report.md`));
  }
  noRule("roadmap-");
});

test("#3/#7/#11/#14/#16 汇总：真实路线图整体零发现", () => {
  assert.deepEqual(realResult.findings, []);
  assert.ok(realResult.counts.tasks >= 77 && realResult.unparsedRows === 0);
});
