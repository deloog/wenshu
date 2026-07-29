/**
 * PA-13 可重放采样入口（只写独立批次目录）：
 * - 对签署基线作一次预热和十次真实 render → evidence → P0/P1 检查；
 * - 逐次同 PA-11A 签署产物的页数、检查结果和无正文的几何向量对账；
 * - 保留每次原始阶段耗时，绝不从中挑选最佳值。
 *
 * 30 页输入尚未冻结时，此入口明确把预算判定标作 not_measured；21 页签署
 * 基线的时间绝不冒充 30 页预算的通过证据。
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { platform, release } from "node:os";
import { resolve } from "node:path";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText, produceBaselinePdf } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { runP0Checks } from "../src/runner.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
const RUNS = 10;
const GEOMETRY_TOLERANCE_PT = 0.01;
const BUDGETS_MS = Object.freeze({ pagination: 8_000, checks: 5_000, export: 30_000 });
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");
const signedPdfPath = resolve(
  repoRoot,
  "packages",
  "pdf-evidence",
  "fixtures",
  "baseline",
  "golden-report-baseline.pdf",
);

interface GeometryEntry {
  readonly pageIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly baselineY: number;
  readonly fontTag: string;
  readonly figureMcid: number | null;
  readonly blockOrder: number;
  readonly readingOrder: number;
}

interface RunRecord {
  readonly run: number;
  readonly pageCount: number;
  readonly p0Findings: number;
  readonly p1Findings: number;
  readonly manualChecks: number;
  readonly geometryMaxDeltaPt: number;
  readonly timingsMs: {
    readonly pagination: number;
    readonly checks: number;
    readonly export: number;
  };
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function geometryOf(
  evidence: ReturnType<typeof mustExtract>,
): readonly GeometryEntry[] {
  return evidence.textRuns.map((run) => ({
    pageIndex: run.pageIndex,
    x: run.bbox.x,
    y: run.bbox.y,
    width: run.bbox.width,
    height: run.bbox.height,
    baselineY: run.baselineY,
    fontTag: run.font.tag,
    figureMcid: run.figureMcid,
    blockOrder: run.blockOrder,
    readingOrder: run.readingOrder,
  }));
}

function mustExtract(bytes: Uint8Array) {
  const result = extractEvidence(bytes);
  if (!result.ok) {
    throw new Error(`PA-13 evidence extraction failed: ${result.issue.code}`);
  }
  return result.evidence;
}

function maxGeometryDelta(
  expected: readonly GeometryEntry[],
  actual: readonly GeometryEntry[],
): number {
  if (expected.length !== actual.length) {
    throw new Error(
      `PA-13 geometry run count drift: ${actual.length} != ${expected.length}`,
    );
  }
  let max = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const a = expected[index];
    const b = actual[index];
    if (a === undefined || b === undefined) {
      throw new Error("PA-13 geometry index unexpectedly absent");
    }
    if (
      a.pageIndex !== b.pageIndex ||
      a.fontTag !== b.fontTag ||
      a.figureMcid !== b.figureMcid ||
      a.blockOrder !== b.blockOrder ||
      a.readingOrder !== b.readingOrder
    ) {
      throw new Error(`PA-13 discrete geometry drift at run ${index}`);
    }
    for (const [left, right] of [
      [a.x, b.x],
      [a.y, b.y],
      [a.width, b.width],
      [a.height, b.height],
      [a.baselineY, b.baselineY],
    ] as const) {
      max = Math.max(max, Math.abs(left - right));
    }
  }
  return max;
}

const outDir = resolve(
  argValue("--out") ??
    resolve(
      repoRoot,
      "artifacts",
      "perf",
      `${new Date().toISOString().slice(0, 10)}-PA-13`,
    ),
);
const browserPath = argValue("--browser");
if (platform() !== "win32" || release() !== "10.0.22621") {
  throw new Error(
    "PA-13 formal sampling requires the registered Windows 11 (10.0.22621) reference machine",
  );
}
await mkdir(outDir, { recursive: false });
await copyFile(
  resolve(repoRoot, "artifacts", "reference-machine", "environment.win11.json"),
  resolve(outDir, "environment.win11.json"),
);

const signedBytes = new Uint8Array(await readFile(signedPdfPath));
if (createHash("sha256").update(signedBytes).digest("hex") !== SIGNED_BASELINE_SHA256) {
  throw new Error("PA-13 signed baseline hash drift");
}
const signedEvidence = mustExtract(signedBytes);
const signedGeometry = geometryOf(signedEvidence);

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgSources = await Promise.all(
  Object.keys(imported.renames).map((name) =>
    readFile(resolve(fixtureRoot, name), "utf8"),
  ),
);
const expected = buildExpectedBlocks(
  imported.document,
  svgSources.map((source) => extractSvgText(source)),
  svgSources.map((source) => extractSvgAspectRatio(source)),
);
const template = validateTemplate(
  JSON.parse(
    await readFile(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
);
if (!template.ok || signedEvidence.pages[0] === undefined) {
  throw new Error("PA-13 frozen template or signed evidence is unavailable");
}
const checkContext = {
  expected,
  contentBox: contentBoxFromMargins(
    template.value.page.margin_mm,
    signedEvidence.pages[0].widthPt,
    signedEvidence.pages[0].heightPt,
  ),
  paginationRules: template.value.pagination_rules,
  headerText: imported.metadata["short_title"],
};

async function oneRun(run: number): Promise<RunRecord> {
  const exported = await produceBaselinePdf({
    fixture: resolve(fixtureRoot, "golden-report.md"),
    fixtureRoot,
    fontDir: resolve(repoRoot, "assets", "fonts", "source-han-sans-cn", "2.005R"),
    templatePath: resolve(fixtureRoot, "formal-business.template.json"),
    browserPath,
  });
  const checkStart = performance.now();
  const evidence = mustExtract(exported.pdfBytes);
  const p0 = runP0Checks({ evidence, ...checkContext });
  const p1 = runP1Checks({ evidence, ...checkContext });
  const geometryMaxDeltaPt = maxGeometryDelta(signedGeometry, geometryOf(evidence));
  if (
    evidence.pages.length !== signedEvidence.pages.length ||
    p0.findings.length !== 0 ||
    p1.findings.length !== 0 ||
    geometryMaxDeltaPt > GEOMETRY_TOLERANCE_PT
  ) {
    throw new Error(
      `PA-13 output drift in run ${run}; no performance result may be accepted`,
    );
  }
  return {
    run,
    pageCount: evidence.pages.length,
    p0Findings: p0.findings.length,
    p1Findings: p1.findings.length,
    manualChecks: p1.manualChecks.length,
    geometryMaxDeltaPt,
    timingsMs: {
      pagination: exported.timings.renderMs,
      checks: performance.now() - checkStart,
      export: exported.timings.totalMs,
    },
  };
}

await oneRun(0); // 按协议预热，不进入原始样本。
const records: RunRecord[] = [];
for (let run = 1; run <= RUNS; run += 1) records.push(await oneRun(run));

const report = {
  task: "PA-13",
  source: {
    signedBaselineSha256: SIGNED_BASELINE_SHA256,
    pageCount: signedEvidence.pages.length,
  },
  protocol: {
    warmupRuns: 1,
    measuredRuns: RUNS,
    geometryTolerancePt: GEOMETRY_TOLERANCE_PT,
  },
  budgetsMs: BUDGETS_MS,
  runs: records,
  thirtyPageBudget: {
    status: "not_measured",
    reason:
      "No frozen 30-page sampling input is present; 21-page baseline timings are not budget evidence.",
  },
};
await writeFile(
  resolve(outDir, "pa-13-repetition.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(`PA-13 repeat evidence written: ${outDir}`);
