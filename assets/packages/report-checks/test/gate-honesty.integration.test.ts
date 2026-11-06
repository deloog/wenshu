/**
 * 闸门诚实性对抗测试（PA-12 命门，验收④）：P0 豁免尝试被拒、P0 漏检即
 * FAIL 不被绕过、manualChecks 绝不充数（只降人工的 fault 不计入检出数）、
 * 正常误报诚实计数超限即 FAIL、P1 豁免记录理由并如实付出检出代价、
 * 未知规则豁免 fail-closed。全部基于真实签署基线与真实检查产出。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { ReportChecksError } from "../src/check-input.ts";
import { buildExpectedBlocks } from "../src/expected-content.ts";
import type { P1RuleId } from "../src/finding.ts";
import { blockRuns } from "../src/gate-fault-helpers.ts";
import { GATE_FAULT_SAMPLES, buildGateSamples } from "../src/gate-faults.ts";
import type { GateSampleInput } from "../src/gate-input.ts";
import { runGate } from "../src/gate-runner.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");

const baselineBytes = new Uint8Array(
  readFileSync(
    resolve(
      repoRoot,
      "packages",
      "pdf-evidence",
      "fixtures",
      "baseline",
      "golden-report-baseline.pdf",
    ),
  ),
);
assert.equal(
  createHash("sha256").update(baselineBytes).digest("hex"),
  SIGNED_BASELINE_SHA256,
);
const extracted = extractEvidence(baselineBytes);
assert.ok(extracted.ok);
const baselineEvidence = extracted.evidence;

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgSources = Object.keys(imported.renames).map((original) =>
  readFileSync(resolve(fixtureRoot, original), "utf8"),
);
const expected = buildExpectedBlocks(
  imported.document,
  svgSources.map((source) => extractSvgText(source)),
  svgSources.map((source) => extractSvgAspectRatio(source)),
);
const templateResult = validateTemplate(
  JSON.parse(
    readFileSync(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
);
assert.ok(templateResult.ok);
const firstPage = baselineEvidence.pages[0];
assert.ok(firstPage !== undefined);
const gateContext = {
  expected,
  contentBox: contentBoxFromMargins(
    templateResult.value.page.margin_mm,
    firstPage.widthPt,
    firstPage.heightPt,
  ),
  paginationRules: templateResult.value.pagination_rules,
  headerText: imported.metadata["short_title"],
};

const faultContext = {
  baseline: baselineEvidence,
  expected,
  contentBox: gateContext.contentBox,
};

function evidenceOf(sampleId: string): WenshuPdfEvidence {
  const spec = GATE_FAULT_SAMPLES.find((sample) => sample.sampleId === sampleId);
  assert.ok(spec !== undefined, `${sampleId} must be registered`);
  return spec.derive(faultContext);
}

function gateInput(samples: readonly GateSampleInput[]) {
  return { baselineSha256: SIGNED_BASELINE_SHA256, ...gateContext, samples };
}

test("P0 exemption attempt is rejected (gate refuses, never bypassable)", () => {
  const samples = buildGateSamples(baselineEvidence, gateContext);
  assert.throws(
    () =>
      runGate(gateInput(samples), {
        exemptions: [
          // 不可信输入模拟：类型级 P1 限定被运行时复核兜底。
          { ruleId: "p0-overlap" as unknown as P1RuleId, reason: "试图豁免 P0" },
        ],
      }),
    (error: unknown) =>
      error instanceof ReportChecksError && error.code === "GATE_P0_EXEMPTION_REJECTED",
  );
});

test("unknown rule exemption is fail-closed", () => {
  const samples = buildGateSamples(baselineEvidence, gateContext);
  assert.throws(
    () =>
      runGate(gateInput(samples), {
        exemptions: [
          { ruleId: "p1-not-a-rule" as unknown as P1RuleId, reason: "未知规则" },
        ],
      }),
    (error: unknown) =>
      error instanceof ReportChecksError && error.code === "REPORT_CHECKS_UNKNOWN_RULE",
  );
});

test("a missed P0 fault fails the gate (GATE_P0_MISSED, never waived)", () => {
  // 构造 P0 漏检：保留 fault 声明（期望码 P0_OVERLAP）但喂入无缺陷证据。
  const spec = GATE_FAULT_SAMPLES.find(
    (sample) => sample.sampleId === "fault-p0-overlap",
  );
  assert.ok(spec !== undefined);
  const missedP0: GateSampleInput = {
    sampleId: spec.sampleId,
    kind: "fault",
    severity: spec.severity,
    domain: spec.domain,
    summary: spec.summary,
    expectedCodes: spec.expectedCodes,
    evidence: structuredClone(baselineEvidence) as WenshuPdfEvidence,
  };
  const samples = buildGateSamples(baselineEvidence, gateContext).map((sample) =>
    sample.sampleId === spec.sampleId ? missedP0 : sample,
  );
  const report = runGate(gateInput(samples));
  const fault = report.samples.find((sample) => sample.sampleId === spec.sampleId);
  assert.ok(fault !== undefined && fault.kind === "fault");
  assert.equal(fault.detected, false);
  assert.equal(report.evaluation.p0DetectedFaults, 3);
  assert.equal(report.evaluation.p0DetectionRate, 0.75);
  assert.equal(report.evaluation.verdict, "fail");
  assert.ok(report.evaluation.failureCodes.includes("GATE_P0_MISSED"));
});

test("manual-only degradation never counts as detection (manualChecks 不充数)", () => {
  // 只降人工的 fault：标题末 run 移到次页 → 实际页不可判定 → P1_TOC_PAGE_REVIEW
  // 降人工（归属完整，无自动发现）。期望码声明 P1_TOC_PAGE_MISMATCH 时
  // detected 必须为 false——manualChecks 存在绝不满足检出。
  const headingRuns = blockRuns(faultContext, "/blocks/3/children/1");
  const lastRun = headingRuns[headingRuns.length - 1];
  assert.ok(lastRun !== undefined);
  const manualOnlyEvidence = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  const moved = manualOnlyEvidence.textRuns.find(
    (run) => run.readingOrder === lastRun.readingOrder,
  );
  assert.ok(moved !== undefined);
  moved.pageIndex = lastRun.pageIndex + 1;
  const manualOnly: GateSampleInput = {
    sampleId: "fault-p1-toc-page-manual-only",
    kind: "fault",
    severity: "P1",
    domain: "p1-toc-page-match",
    summary: "实际页不可判定 fault（只降人工，无自动发现）。",
    expectedCodes: ["P1_TOC_PAGE_MISMATCH"],
    evidence: manualOnlyEvidence,
  };
  const samples = [...buildGateSamples(baselineEvidence, gateContext), manualOnly];
  const report = runGate(gateInput(samples));
  const fault = report.samples.find(
    (sample) => sample.sampleId === "fault-p1-toc-page-manual-only",
  );
  assert.ok(fault !== undefined && fault.kind === "fault");
  assert.equal(fault.detected, false);
  assert.ok(
    fault.manualChecks.some((manual) => manual.code === "P1_TOC_PAGE_REVIEW"),
    "manual review item must exist (it is evidence, not detection)",
  );
  // 声明的期望码绝不由 manualChecks 满足（他域连带发现与本案无关）。
  assert.ok(fault.findings.every((finding) => finding.code !== "P1_TOC_PAGE_MISMATCH"));
  // 检出数只计真实 findings：12 个真 fault 全检出，本样本不充数。
  assert.equal(report.evaluation.detectedFaults, 12);
  assert.equal(report.evaluation.faultSampleCount, 13);
});

test("normal-sample false positives are honestly counted and overflow fails the gate", () => {
  // 第二个“正常”样本喂入带 3 个真实发现的证据（空页 fault 派生）——
  // 误报不得隐藏/重分类：3 > 2 → GATE_FALSE_POSITIVE_OVERFLOW。
  const polluted: GateSampleInput = {
    sampleId: "normal-polluted",
    kind: "normal",
    summary: "污染正常样本（误报诚实计数对抗面）。",
    evidence: evidenceOf("fault-p1-empty-page"),
  };
  const samples = [...buildGateSamples(baselineEvidence, gateContext), polluted];
  const report = runGate(gateInput(samples));
  const normal = report.samples.find((sample) => sample.sampleId === "normal-polluted");
  assert.ok(normal !== undefined && normal.kind === "normal");
  assert.equal(normal.falsePositives, normal.findings.length);
  assert.ok(normal.findings.length > 2);
  assert.equal(report.evaluation.normalFalsePositives, normal.findings.length);
  assert.equal(report.evaluation.verdict, "fail");
  assert.ok(report.evaluation.failureCodes.includes("GATE_FALSE_POSITIVE_OVERFLOW"));
});

test("P1 exemption is recorded with reason and honestly costs detection", () => {
  const samples = buildGateSamples(baselineEvidence, gateContext);
  const report = runGate(gateInput(samples), {
    exemptions: [
      { ruleId: "p1-figure-aspect", reason: "演示豁免：登记理由后方可豁免 P1" },
    ],
  });
  assert.deepEqual(report.exemptions, [
    { ruleId: "p1-figure-aspect", reason: "演示豁免：登记理由后方可豁免 P1" },
  ]);
  assert.ok(!report.executedRules.includes("p1-figure-aspect"));
  assert.equal(report.executedRules.length, 17);
  const fault = report.samples.find(
    (sample) => sample.sampleId === "fault-p1-figure-aspect-distorted",
  );
  assert.ok(fault !== undefined && fault.kind === "fault");
  assert.equal(fault.detected, false);
  // 豁免代价如实计入检出统计（11/12 ≥ 10 仍 pass，但绝不伪装成 12）。
  assert.equal(report.evaluation.detectedFaults, 11);
  assert.equal(report.evaluation.verdict, "pass");
});

test("exempting three P1 domains drops detection below threshold and fails the gate", () => {
  const samples = buildGateSamples(baselineEvidence, gateContext);
  const report = runGate(gateInput(samples), {
    exemptions: [
      { ruleId: "p1-figure-aspect", reason: "豁免一" },
      { ruleId: "p1-toc-page-match", reason: "豁免二" },
      { ruleId: "p1-stamp-consistency", reason: "豁免三" },
    ],
  });
  assert.equal(report.evaluation.detectedFaults, 9);
  assert.equal(report.evaluation.verdict, "fail");
  assert.ok(report.evaluation.failureCodes.includes("GATE_DETECTION_BELOW_THRESHOLD"));
});
