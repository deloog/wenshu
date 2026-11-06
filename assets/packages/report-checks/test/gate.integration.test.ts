/**
 * 汇总闸门集成测试（PA-12）：真实签署基线（sha256 锚定）+ 真实冻结模板
 * + 12 fault 样本确定性内存派生（不改冻结物）。覆盖验收①②③⑤：正常样本
 * 0 自动发现 + 人工清单 33 项填充、12 fault P0 全检出且 P0+P1=12/12≥10、
 * 门槛评估诚实计数（只基于真实 findings）、契约版本化/确定性/零规则改动。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { GATE_FAULT_SAMPLES, buildGateSamples } from "../src/gate-faults.ts";
import { runGate } from "../src/gate-runner.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";
import { validateGateReport } from "../src/validate-gate-report.ts";

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
  "baseline fixture must be the PA-05 signed artifact",
);
const extracted = extractEvidence(baselineBytes);
assert.ok(extracted.ok, "signed baseline must extract");
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
assert.ok(templateResult.ok, "frozen template must validate via the controlled path");
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

const samples = buildGateSamples(baselineEvidence, gateContext);

function runFullGate() {
  return runGate({
    baselineSha256: SIGNED_BASELINE_SHA256,
    ...gateContext,
    samples,
  });
}

test("sample set: 1 normal + 12 fault, each domain covered exactly once", () => {
  assert.equal(samples.length, 13);
  assert.equal(GATE_FAULT_SAMPLES.length, 12);
  const normal = samples.filter((sample) => sample.kind === "normal");
  const faults = samples.filter((sample) => sample.kind === "fault");
  assert.equal(normal.length, 1);
  assert.equal(faults.length, 12);
  // 覆盖域（不挑软柿子）：P0 四域 + P1 八域，每域恰好一例。
  assert.deepEqual(
    faults.map((sample) => `${sample.severity}:${sample.domain}`),
    [
      "P0:p0-page-size",
      "P0:p0-bounds",
      "P0:p0-overlap",
      "P0:p0-content",
      "P1:p1-heading-keep",
      "P1:p1-orphan",
      "P1:p1-widow",
      "P1:p1-sparse-page",
      "P1:p1-table-header-repeat",
      "P1:p1-figure-aspect",
      "P1:p1-toc-page-match",
      "P1:p1-stamp-consistency",
    ],
  );
  // 派生确定性：同锚点重复派生逐字节一致。
  const again = buildGateSamples(baselineEvidence, gateContext);
  assert.equal(JSON.stringify(again), JSON.stringify(samples));
});

test("acceptance 1: normal sample — zero findings, 33 manual checklist items filled", () => {
  const report = runFullGate();
  const normal = report.samples.find((sample) => sample.kind === "normal");
  assert.ok(normal !== undefined);
  assert.deepEqual(normal.findings, []);
  assert.equal(normal.falsePositives, 0);
  // 人工清单填充（各通道计数）：标题灰区 10 + 逐页密度 21 + 图清晰度 2 = 33。
  assert.equal(normal.manualChecks.length, 33);
  const byCode = new Map<string, number>();
  for (const manual of normal.manualChecks) {
    byCode.set(manual.code, (byCode.get(manual.code) ?? 0) + 1);
  }
  assert.equal(byCode.get("P1_HEADING_KEEP_REVIEW"), 10);
  assert.equal(byCode.get("P1_SPARSE_DENSITY_REVIEW"), 21);
  assert.equal(byCode.get("P1_FIGURE_LEGIBILITY_REVIEW"), 2);
  // 全检查族真实执行（18 条，固定注册序）。
  assert.deepEqual(report.executedRules, [
    "p0-page-size",
    "p0-bounds",
    "p0-overlap",
    "p0-content",
    "p1-heading-keep",
    "p1-orphan",
    "p1-widow",
    "p1-sparse-page",
    "p1-table-header-repeat",
    "p1-table-row-split",
    "p1-figure-caption",
    "p1-figure-source",
    "p1-figure-aspect",
    "p1-figure-fidelity",
    "p1-figure-legibility",
    "p1-toc-reconcile",
    "p1-toc-page-match",
    "p1-stamp-consistency",
  ]);
});

test("acceptance 2: all 12 faults detected — P0 100%, P0+P1 12/12, each located", () => {
  const report = runFullGate();
  const faults = report.samples.filter((sample) => sample.kind === "fault");
  assert.equal(faults.length, 12);
  for (const fault of faults) {
    assert.ok(
      fault.detected,
      `${fault.sampleId} must be detected: ${JSON.stringify(fault.findings.map((f) => f.code))}`,
    );
    // 每个检出带页/节点定位。
    for (const code of fault.expectedCodes) {
      const hit = fault.findings.find((finding) => finding.code === code);
      assert.ok(hit !== undefined, `${fault.sampleId} missing ${code}`);
      assert.ok(hit.pageIndex >= 0 && hit.nodeRef.length > 0);
      assert.ok(Object.keys(hit.basis.metrics).length > 0);
    }
  }
  // 逐样本钉定位（探针实测锚点）。
  const at = (sampleId: string) =>
    faults.find((sample) => sample.sampleId === sampleId);
  const pin = (
    sampleId: string,
    code: string,
    pageIndex: number,
    nodeRefPrefix: string,
  ) => {
    const sample = at(sampleId);
    const hit = sample?.findings.find((finding) => finding.code === code);
    assert.ok(hit !== undefined, `${sampleId} must yield ${code}`);
    assert.equal(hit.pageIndex, pageIndex, sampleId);
    assert.ok(
      hit.nodeRef.startsWith(nodeRefPrefix),
      `${sampleId}: ${hit.nodeRef} must start with ${nodeRefPrefix}`,
    );
  };
  pin("fault-p0-page-size", "P0_PAGE_SIZE", 3, "page:3");
  pin("fault-p0-out-of-bounds", "P0_OUT_OF_BOUNDS", 2, "run:");
  pin("fault-p0-overlap", "P0_OVERLAP", 8, "run:");
  // 内容缺失定位到文档块（页随基线布局钉定，不硬钉页码）。
  const contentHit = faults
    .find((sample) => sample.sampleId === "fault-p0-content-missing")
    ?.findings.find((finding) => finding.code === "P0_CONTENT_MISSING");
  assert.ok(contentHit !== undefined);
  assert.ok(contentHit.nodeRef.startsWith("/blocks/"));
  assert.ok((contentHit.basis.metrics["expectedLength"] ?? 0) >= 8);
  pin("fault-p1-heading-separated", "P1_HEADING_SEPARATED", 2, "/blocks/1");
  pin("fault-p1-orphan", "P1_ORPHAN", 2, "/blocks/1/children/0");
  pin("fault-p1-widow", "P1_WIDOW", 3, "/blocks/1/children/0");
  pin("fault-p1-empty-page", "P1_EMPTY_PAGE", 5, "page:5");
  pin(
    "fault-p1-table-header-not-repeated",
    "P1_TABLE_HEADER_NOT_REPEATED",
    13,
    "/blocks/7/children/2/children/2/children/0",
  );
  pin(
    "fault-p1-figure-aspect-distorted",
    "P1_FIGURE_ASPECT_DISTORTED",
    8,
    "figure:8:0",
  );
  pin(
    "fault-p1-toc-page-mismatch",
    "P1_TOC_PAGE_MISMATCH",
    3,
    "/blocks/1/children/6/entries/7",
  );
  pin("fault-p1-footer-page-mismatch", "P1_FOOTER_PAGE_MISMATCH", 4, "run:");
  // PA-11A 实际页码红线：标注 6 ≠ 实际 7（实际页只从证据读）。
  const tocHit = at("fault-p1-toc-page-mismatch")?.findings.find(
    (finding) => finding.code === "P1_TOC_PAGE_MISMATCH",
  );
  assert.equal(tocHit?.basis.metrics["printedPage"], 6);
  assert.equal(tocHit?.basis.metrics["actualPage"], 7);
  // PA-K1 边界：图遮正文落 PA-07 检出域（成员制 paintBBox 判据）。
  const overlapHit = at("fault-p0-overlap")?.findings.find(
    (finding) => finding.code === "P0_OVERLAP",
  );
  assert.equal(overlapHit?.basis.relatedNodeRef, "figure:8:0");
});

test("acceptance 3: evaluation counts real findings only; verdict pass; reader round-trip", () => {
  const report = runFullGate();
  assert.deepEqual(report.evaluation, {
    faultSampleCount: 12,
    detectedFaults: 12,
    p0FaultSampleCount: 4,
    p0DetectedFaults: 4,
    p0DetectionRate: 1,
    normalFalsePositives: 0,
    verdict: "pass",
    failureCodes: [],
  });
  // 门槛常量钉死（与契约 schema 常量一致）。
  assert.deepEqual(report.thresholds, {
    faultSampleCount: 12,
    minDetectedFaults: 10,
    maxNormalFalsePositives: 2,
  });
  // 产出过独立 reader（语义全量重算）零分歧。
  const roundTrip = validateGateReport(JSON.parse(JSON.stringify(report)));
  assert.ok(roundTrip.ok, JSON.stringify(roundTrip.ok ? [] : roundTrip.issues));
});

test("acceptance 4: manual checklist carries PA-A7/J1/K1/L1~L4/M1~M5/N1/N2 item by item", () => {
  const report = runFullGate();
  assert.deepEqual(
    report.manualChecklist.map((item) => item.itemId),
    [
      "PA-A7",
      "PA-J1",
      "PA-K1",
      "PA-L1",
      "PA-L2",
      "PA-L3",
      "PA-L4",
      "PA-M1",
      "PA-M2",
      "PA-M3",
      "PA-M4",
      "PA-M5",
      "PA-N1",
      "PA-N2",
    ],
  );
  for (const item of report.manualChecklist) {
    assert.ok(item.summary.length > 0 && item.summary.length <= 300);
    assert.ok(
      ["carried", "registered", "closed", "external"].includes(item.disposition),
    );
  }
  // 动态钉数：J1/M1/N2 的 relatedCount === 正常样本真实 manualChecks 总数 33。
  for (const id of ["PA-J1", "PA-M1", "PA-N2"]) {
    const item = report.manualChecklist.find((entry) => entry.itemId === id);
    assert.equal(item?.relatedCount, 33, id);
  }
});

test("acceptance 5: determinism (same samples, byte-identical report); no content echo", () => {
  const first = JSON.stringify(runFullGate());
  const second = JSON.stringify(runFullGate());
  assert.equal(first, second);
  // 报告只标位置+依据，不回显正文（基线标题/正文标志串）。
  assert.ok(!first.includes("AI 辅助长文"));
  assert.ok(!first.includes("执行摘要"));
  assert.ok(!first.includes("首期处置"));
});
