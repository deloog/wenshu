/**
 * 可复放 P0 基线检查：对 @wenshu/pdf-evidence 随包签署的基线 PDF 跑全部
 * P0 规则并打印报告（审计重放点）。期望内容来自 golden-report.md 文档
 * （markdown-import），版心来自 formal-business 模板边距。
 *
 * 用法：node packages/report-checks/scripts/run-p0-baseline.ts
 * 退出码：0 = 0 个 P0 发现；1 = 存在 P0 或提取失败。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins, type MarginMm } from "../src/layout.ts";
import { runP0Checks } from "../src/runner.ts";

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

const bytes = new Uint8Array(readFileSync(baselinePath));
const extracted = extractEvidence(bytes);
if (!extracted.ok) {
  console.error(`baseline extraction failed: ${extracted.issue.code}`);
  process.exit(1);
}

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
const page = extracted.evidence.pages[0];
if (page === undefined) {
  console.error("no pages in baseline evidence");
  process.exit(1);
}
const contentBox = contentBoxFromMargins(
  template.page.margin_mm,
  page.widthPt,
  page.heightPt,
);

const report = runP0Checks({ evidence: extracted.evidence, expected, contentBox });
console.log(JSON.stringify(report, null, 2));
console.error(
  `rules=${report.rules.length} findings=${report.findings.length} expectedBlocks=${expected.length}`,
);
process.exit(report.findings.length === 0 ? 0 : 1);
