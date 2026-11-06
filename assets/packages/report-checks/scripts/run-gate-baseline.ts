/**
 * 可重放审计入口（PA-12）：对 PA-05 签署基线装配正常样本 + 12 fault
 * 样本，跑全检查族（P0: PA-07；P1: PA-08/09/10/11B 真实产出，不重实现、
 * 不 mock），产出版本化门禁报告。退出码 0 当且仅当 verdict === "pass"
 * （P0 全检出、P0+P1 ≥ 10/12、正常误报 ≤ 2）。可选 `--out <path>` 将
 * 完整报告 JSON 落盘（确定性输出，同样本同报告）。
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { buildGateSamples } from "../src/gate-faults.ts";
import { runGate } from "../src/gate-runner.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
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
if (!templateResult.ok) {
  throw new Error("frozen template failed controlled validation");
}
const firstPage = extracted.evidence.pages[0];
if (firstPage === undefined) {
  throw new Error("baseline evidence has no pages");
}
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

const samples = buildGateSamples(extracted.evidence, gateContext);
const report = runGate({
  baselineSha256: SIGNED_BASELINE_SHA256,
  ...gateContext,
  samples,
});

const detectedList = report.samples
  .filter((sample) => sample.kind === "fault")
  .map((sample) => `${sample.sampleId}=${sample.detected ? "detected" : "MISSED"}`);
console.log(
  `gate: verdict=${report.evaluation.verdict} ` +
    `p0=${report.evaluation.p0DetectedFaults}/${report.evaluation.p0FaultSampleCount} ` +
    `detected=${report.evaluation.detectedFaults}/${report.evaluation.faultSampleCount} ` +
    `falsePositives=${report.evaluation.normalFalsePositives} ` +
    `failures=[${report.evaluation.failureCodes.join(",")}]`,
);
console.log(`gate faults: ${detectedList.join(" ")}`);

const outIndex = process.argv.indexOf("--out");
if (outIndex !== -1) {
  const outPath = process.argv[outIndex + 1];
  if (outPath === undefined) {
    throw new Error("--out requires a path");
  }
  writeFileSync(resolve(outPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`gate report written: ${resolve(outPath)}`);
}

if (report.evaluation.verdict !== "pass") {
  process.exit(1);
}
