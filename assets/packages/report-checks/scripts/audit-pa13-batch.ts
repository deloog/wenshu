/**
 * PA-13 30 页批次的离线复核器。
 *
 * 此脚本不导出 PDF，也不产生性能数字：它只对 VM 已产出的十份 PDF 作同源
 * 证据提取、检查重放和几何对账。因此审计者可以在不信任导出计时器的前提下
 * 独立重算正确性。诊断只包含数值、页号和稳定 code，不回显正文。
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";
import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { runP0Checks } from "../src/runner.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const rootArg = argValue("--batch");
if (rootArg === undefined) throw new Error("requires --batch <PA-13 batch directory>");
const root = resolve(rootArg);
const inputRoot = resolve(root, "input");
const inputPath = resolve(inputRoot, "pa-13-performance-30-page.md");
const imported = await importMarkdownDocument(inputPath, inputRoot);
const sources = await Promise.all(
  Object.keys(imported.renames).map((name) =>
    readFile(resolve(inputRoot, name), "utf8"),
  ),
);
const expected = buildExpectedBlocks(
  imported.document,
  sources.map(extractSvgText),
  sources.map(extractSvgAspectRatio),
);
const template = validateTemplate(
  JSON.parse(
    await readFile(resolve(inputRoot, "formal-business.template.json"), "utf8"),
  ),
);
if (!template.ok) throw new Error("template invalid");
const budgetsMs = Object.freeze({ pagination: 8_000, checks: 5_000, export: 30_000 });
const values = {
  pagination: [] as number[],
  checks: [] as number[],
  export: [] as number[],
};

function percentileNearestRank(samples: readonly number[], percentile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.ceil(percentile * sorted.length) - 1;
  const value = sorted[index];
  if (value === undefined) throw new Error("empty PA-13 timing sample");
  return value;
}

function summarize(
  samples: readonly number[],
  budget: number,
): Record<string, unknown> {
  const median = percentileNearestRank(samples, 0.5);
  const p95 = percentileNearestRank(samples, 0.95);
  return {
    rawMs: samples,
    medianMs: median,
    p95Ms: p95,
    budgetMs: budget,
    status: p95 <= budget ? "met" : "not_met",
  };
}

const records: Array<Record<string, unknown>> = [];
let geometry: string | undefined;
for (let i = 1; i <= 10; i += 1) {
  const pdf = new Uint8Array(
    await readFile(resolve(root, "runs", String(i), "golden-report-baseline.pdf")),
  );
  const exportEvidence = JSON.parse(
    await readFile(resolve(root, "runs", String(i), "evidence.json"), "utf8"),
  ) as {
    readonly timings?: { readonly renderMs?: unknown; readonly totalMs?: unknown };
  };
  const paginationMs = exportEvidence.timings?.renderMs;
  const exportMs = exportEvidence.timings?.totalMs;
  if (typeof paginationMs !== "number" || typeof exportMs !== "number") {
    throw new Error(`run ${i} lacks numeric export timings`);
  }
  const result = extractEvidence(pdf);
  if (!result.ok) throw new Error(`run ${i} evidence ${result.issue.code}`);
  const page = result.evidence.pages[0];
  if (page === undefined) throw new Error("no page");
  const context = {
    evidence: result.evidence,
    expected,
    contentBox: contentBoxFromMargins(
      template.value.page.margin_mm,
      page.widthPt,
      page.heightPt,
    ),
    paginationRules: template.value.pagination_rules,
    headerText: imported.metadata["short_title"],
  };
  const start = performance.now();
  const p0 = runP0Checks(context);
  const p1 = runP1Checks(context);
  const checksMs = performance.now() - start;
  values.pagination.push(paginationMs);
  values.checks.push(checksMs);
  values.export.push(exportMs);
  const currentGeometry = JSON.stringify(
    result.evidence.textRuns.map((run) => [
      run.pageIndex,
      run.bbox.x,
      run.bbox.y,
      run.bbox.width,
      run.bbox.height,
      run.baselineY,
      run.blockOrder,
      run.readingOrder,
    ]),
  );
  if (geometry !== undefined && geometry !== currentGeometry) {
    throw new Error(`run ${i} geometry drift`);
  }
  geometry = currentGeometry;
  if (
    result.evidence.pages.length !== 30 ||
    p0.findings.length !== 0 ||
    p1.findings.length !== 0
  ) {
    throw new Error(`run ${i} failed PA-13 correctness replay`);
  }
  records.push({
    run: i,
    pageCount: result.evidence.pages.length,
    p0Findings: p0.findings.length,
    p1Findings: p1.findings.length,
    manualChecks: p1.manualChecks.length,
    paginationMs,
    checksMs,
    exportMs,
    pdfSha256: createHash("sha256").update(pdf).digest("hex"),
  });
}
await writeFile(
  resolve(root, "pa-13-independent-replay.json"),
  `${JSON.stringify(
    {
      task: "PA-13",
      replay: "independent",
      budgetSource: "docs/performance-budgets.md + docs/reference-machine.md §3",
      percentile: "nearest-rank",
      runs: records,
      summary: {
        pagination: summarize(values.pagination, budgetsMs.pagination),
        checks: summarize(values.checks, budgetsMs.checks),
        export: summarize(values.export, budgetsMs.export),
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);
