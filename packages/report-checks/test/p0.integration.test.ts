/**
 * P0 集成测试：真实签署基线证据（PA-06 规范生产器，非自行解析）+
 * 内存派生 fault（不修改任何冻结物）。覆盖验收①②③④。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText, normalizePdfText } from "@wenshu/pdf-export";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins, type MarginMm } from "../src/layout.ts";
import { runP0Checks } from "../src/runner.ts";

const SIGNED_BASELINE_SHA256 =
  "d18da69f4663c694f2dcea738ca9cabbaa2f16fac03d10eaf434efceaece6dfd";
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const baselinePath = resolve(
  repoRoot,
  "packages",
  "pdf-evidence",
  "fixtures",
  "baseline",
  "golden-report-baseline.pdf",
);
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");

const baselineBytes = new Uint8Array(readFileSync(baselinePath));
assert.equal(
  createHash("sha256").update(baselineBytes).digest("hex"),
  SIGNED_BASELINE_SHA256,
  "baseline fixture must be the PA-05 signed artifact",
);
const extracted = extractEvidence(baselineBytes);
assert.ok(extracted.ok, "signed baseline must extract");

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgTexts = Object.keys(imported.renames).map((original) =>
  extractSvgText(readFileSync(resolve(fixtureRoot, original), "utf8")),
);
const expected = buildExpectedBlocks(imported.document, svgTexts);

const template = JSON.parse(
  readFileSync(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
) as { page: { margin_mm: MarginMm } };
const firstPage = extracted.evidence.pages[0];
assert.ok(firstPage !== undefined);
const contentBox = contentBoxFromMargins(
  template.page.margin_mm,
  firstPage.widthPt,
  firstPage.heightPt,
);

const baselineEvidence = extracted.evidence;

function inputFor(evidence: WenshuPdfEvidence) {
  return { evidence, expected, contentBox };
}

/** 内存派生 fault：深拷贝后注入缺陷，冻结基线证据不受影响。 */
function derive(mutate: (draft: WenshuPdfEvidence) => void): WenshuPdfEvidence {
  const draft = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  mutate(draft);
  return draft;
}

test("acceptance 1: signed baseline yields zero P0 findings across all rules", () => {
  const report = runP0Checks(inputFor(baselineEvidence));
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.rules, [
    "p0-page-size",
    "p0-bounds",
    "p0-overlap",
    "p0-content",
  ]);
});

test("acceptance 2: oversized page fault is detected at the right page", () => {
  const fault = derive((draft) => {
    const page = draft.pages[3];
    assert.ok(page !== undefined);
    page.widthPt = 700;
  });
  const report = runP0Checks(inputFor(fault));
  const hits = report.findings.filter((finding) => finding.code === "P0_PAGE_SIZE");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.pageIndex, 3);
  assert.equal(hits[0]?.nodeRef, "page:3");
});

test("acceptance 2: out-of-bounds fault is detected with the injected amount", () => {
  let targetOrder = -1;
  const fault = derive((draft) => {
    const run = draft.textRuns.find(
      (candidate) => candidate.pageIndex === 2 && candidate.bbox.width > 0,
    );
    assert.ok(run !== undefined);
    targetOrder = run.readingOrder;
    run.bbox.x = contentBox.right + 5;
  });
  const report = runP0Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) =>
      finding.code === "P0_OUT_OF_BOUNDS" && finding.nodeRef === `run:${targetOrder}`,
  );
  assert.equal(hits.length, 1);
  assert.ok((hits[0]?.basis.metrics["beyondContentBoxPt"] ?? 0) >= 4.9);
});

test("acceptance 2: overlap fault between two lines is detected with both refs", () => {
  let firstOrder = -1;
  let secondOrder = -1;
  const fault = derive((draft) => {
    const runs = draft.textRuns.filter(
      (candidate) => candidate.pageIndex === 1 && candidate.bbox.width > 1,
    );
    const a = runs[10];
    const b = runs[40];
    assert.ok(a !== undefined && b !== undefined);
    firstOrder = a.readingOrder;
    secondOrder = b.readingOrder;
    b.bbox.x = a.bbox.x;
    b.bbox.y = a.bbox.y;
    b.baselineY = a.baselineY + 20;
    b.blockOrder = a.blockOrder + 1;
  });
  const report = runP0Checks(inputFor(fault));
  const hits = report.findings.filter((finding) => finding.code === "P0_OVERLAP");
  assert.ok(hits.length >= 1);
  const hit = hits.find(
    (finding) =>
      finding.nodeRef === `run:${firstOrder}` &&
      finding.basis.relatedNodeRef === `run:${secondOrder}`,
  );
  assert.ok(hit !== undefined, JSON.stringify(hits));
  assert.ok((hit.basis.metrics["overlapAreaPt2"] ?? 0) > 0.5);
});

test("acceptance 2: figure fully covering body text (no straddle) is detected as P0_OVERLAP", () => {
  // PA-I1 原例（决策 #10）：非成员正文 run 完全落入 figure 绘制框（不骑缝）
  // → P0。基线形态：p7 figure paintBBox ≈ x87..508 × y546..785。
  const figure = baselineEvidence.figures.find(
    (candidate) => candidate.pageIndex === 7,
  );
  assert.ok(figure !== undefined);
  let coveredOrder = -1;
  const fault = derive((draft) => {
    // 选一个页 7 的非成员正文 run，整体挪入 figure 绘制框中央。
    const run = draft.textRuns.find(
      (candidate) => candidate.pageIndex === 7 && candidate.figureMcid === null,
    );
    assert.ok(run !== undefined);
    coveredOrder = run.readingOrder;
    run.bbox.x = figure.paintBBox.x + 50;
    run.bbox.y = figure.paintBBox.y - 50;
  });
  const report = runP0Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) =>
      finding.code === "P0_OVERLAP" &&
      finding.nodeRef === `run:${coveredOrder}` &&
      finding.basis.relatedNodeRef === `figure:7:${figure.mcid}`,
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 5)));
  assert.ok((hits[0]?.basis.metrics["overlapAreaPt2"] ?? 0) > 0.5);
});

test("acceptance 2: figure-member runs stay exempt on the signed baseline (no false positives)", () => {
  // 误报门：p7/p9 的图表标签 run 都是成员，基线整体仍 0 P0（验收②由
  // acceptance 1 全覆盖，此处专断成员豁免路径确实生效——成员与绘制框重叠）。
  const members = baselineEvidence.textRuns.filter((run) => run.figureMcid !== null);
  assert.ok(members.length > 0);
  const report = runP0Checks(inputFor(baselineEvidence));
  assert.ok(
    report.findings.every(
      (finding) =>
        !members.some((run) => finding.nodeRef === `run:${run.readingOrder}`),
    ),
  );
});

test("acceptance 2: deleted paragraph is detected as missing content at its block", () => {
  // 找到第一个在证据中唯一出现的 paragraph 期望块（标题类文本会多处出现，
  // 删除一处不等于内容缺失），定位其覆盖 run 区间并在派生证据中删除。
  const orderedForPick = [...baselineEvidence.textRuns].sort(
    (a, b) => a.readingOrder - b.readingOrder,
  );
  const joinedAll = orderedForPick.map((run) => normalizePdfText(run.text)).join("");
  const paragraph = expected.find(
    (block) =>
      block.ref.startsWith("/blocks/") &&
      !block.repeatable &&
      block.text.length >= 8 &&
      joinedAll.indexOf(block.text) !== -1 &&
      joinedAll.indexOf(block.text) === joinedAll.lastIndexOf(block.text),
  );
  assert.ok(paragraph !== undefined);
  const ordered = orderedForPick;
  const normalizedRuns = ordered.map((run) => normalizePdfText(run.text));
  const joined = normalizedRuns.join("");
  const start = joined.indexOf(paragraph.text);
  assert.ok(start !== -1, "paragraph must be present in baseline evidence");
  const end = start + paragraph.text.length;
  let offset = 0;
  const covering = new Set<number>();
  normalizedRuns.forEach((text, index) => {
    const runStart = offset;
    offset += text.length;
    if (runStart < end && offset > start) {
      covering.add(index);
    }
  });
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.filter((run) => !covering.has(run.readingOrder));
  });
  const report = runP0Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) =>
      finding.code === "P0_CONTENT_MISSING" && finding.nodeRef === paragraph.ref,
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 3)));
  assert.equal(hits[0]?.basis.metrics["expectedLength"], paragraph.text.length);
});

test("acceptance 3: per-rule rollback suppresses only that rule on a multi-fault input", () => {
  const fault = derive((draft) => {
    const page = draft.pages[0];
    assert.ok(page !== undefined);
    page.widthPt = 700;
    const run = draft.textRuns[0];
    assert.ok(run !== undefined);
    run.bbox.x = 690;
  });
  const withoutPageSize = runP0Checks(inputFor(fault), {
    disabledRules: ["p0-page-size"],
  });
  assert.ok(
    withoutPageSize.findings.every((finding) => finding.code !== "P0_PAGE_SIZE"),
  );
  assert.ok(
    withoutPageSize.findings.some((finding) => finding.code === "P0_OUT_OF_BOUNDS"),
  );
});

test("acceptance 4: findings never echo document content", () => {
  const report = runP0Checks(inputFor(baselineEvidence));
  const serialized = JSON.stringify(report);
  // 基线标题与正文标志串不得出现在任何报告中（即便有发现）。
  assert.ok(!serialized.includes("AI 辅助长文"));
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.slice(50);
  });
  const faultReport = runP0Checks(inputFor(fault));
  assert.ok(faultReport.findings.length > 0);
  assert.ok(!JSON.stringify(faultReport).includes("AI 辅助长文"));
});

test("acceptance 4: identical input yields byte-identical reports", () => {
  const first = JSON.stringify(runP0Checks(inputFor(baselineEvidence)));
  const second = JSON.stringify(runP0Checks(inputFor(baselineEvidence)));
  assert.equal(first, second);
});
