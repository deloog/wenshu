/**
 * 可重放审计入口（PA-08）：对 PA-05 签署基线跑全部 P1 规则。
 * 退出码 0 当且仅当自动发现为 0（基线零违规）；人工核验项（诚实门）
 * 如实计数打印——它们是审查数据，不是通过也不是发现。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

const SIGNED_BASELINE_SHA256 =
  "d18da69f4663c694f2dcea738ca9cabbaa2f16fac03d10eaf434efceaece6dfd";
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");

const bytes = new Uint8Array(
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
if (createHash("sha256").update(bytes).digest("hex") !== SIGNED_BASELINE_SHA256) {
  throw new Error("baseline fixture is not the PA-05 signed artifact");
}
const extracted = extractEvidence(bytes);
if (!extracted.ok) {
  throw new Error("signed baseline failed evidence extraction");
}

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgSources = Object.keys(imported.renames).map((original) =>
  readFileSync(resolve(fixtureRoot, original), "utf8"),
);
const svgTexts = svgSources.map((source) => extractSvgText(source));
const svgAspects = svgSources.map((source) => extractSvgAspectRatio(source));
const expected = buildExpectedBlocks(imported.document, svgTexts, svgAspects);

const templateResult = validateTemplate(
  JSON.parse(
    readFileSync(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
);
if (!templateResult.ok) {
  throw new Error("frozen template failed controlled validation");
}
const firstPage = extracted.evidence.pages[0];
if (firstPage === undefined) {
  throw new Error("baseline evidence has no pages");
}
const contentBox = contentBoxFromMargins(
  templateResult.value.page.margin_mm,
  firstPage.widthPt,
  firstPage.heightPt,
);

const report = runP1Checks({
  evidence: extracted.evidence,
  expected,
  contentBox,
  paginationRules: templateResult.value.pagination_rules,
});
const headingReviews = report.manualChecks.filter(
  (manual) => manual.code === "P1_HEADING_KEEP_REVIEW",
).length;
const densityReviews = report.manualChecks.filter(
  (manual) => manual.code === "P1_SPARSE_DENSITY_REVIEW",
).length;
const figureReviews = report.manualChecks.filter((manual) =>
  manual.code.startsWith("P1_FIGURE_"),
).length;
console.log(
  `p1 baseline: findings=${report.findings.length} ` +
    `manualChecks=${report.manualChecks.length} ` +
    `(headingKeepReview=${headingReviews}, sparseDensityReview=${densityReviews}, ` +
    `figureReview=${figureReviews})`,
);
if (report.findings.length > 0) {
  console.error(JSON.stringify(report.findings, null, 2));
  process.exit(1);
}
