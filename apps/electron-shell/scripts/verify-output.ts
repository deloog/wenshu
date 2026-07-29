import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import {
  buildExpectedBlocks,
  contentBoxFromMargins,
  runP0Checks,
  runP1Checks,
} from "@wenshu/report-checks";
import { validateTemplate } from "@wenshu/template-model";

const root = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(root, "docs/poc-a/fixtures");
const baselinePath = resolve(
  root,
  "packages/pdf-evidence/fixtures/baseline/golden-report-baseline.pdf",
);
const electronPath = resolve(
  root,
  "test-results/pa-14e-electron/electron-baseline.pdf",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function geometryVector(evidence: {
  readonly textRuns: readonly {
    readonly pageIndex: number;
    readonly bbox: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly baselineY: number;
    readonly blockOrder: number;
    readonly readingOrder: number;
  }[];
}): readonly number[] {
  return evidence.textRuns.flatMap((run) => [
    run.pageIndex,
    run.bbox.x,
    run.bbox.y,
    run.bbox.width,
    run.bbox.height,
    run.baselineY,
    run.blockOrder,
    run.readingOrder,
  ]);
}

const [baselineBytes, electronBytes] = await Promise.all([
  readFile(baselinePath),
  readFile(electronPath),
]);
const baseline = extractEvidence(new Uint8Array(baselineBytes));
const electron = extractEvidence(new Uint8Array(electronBytes));
assert(baseline.ok && electron.ok, "PDF evidence extraction must succeed");
assert(
  electron.evidence.pages.length === baseline.evidence.pages.length,
  "Electron page count differs from signed Chromium baseline",
);
assert(
  electron.evidence.fonts.every((font) => font.embedded),
  "Electron PDF has an unembedded font",
);
const baselineGeometry = geometryVector(baseline.evidence);
const electronGeometry = geometryVector(electron.evidence);
assert(
  baselineGeometry.length === electronGeometry.length,
  "Electron text-run count differs",
);
for (let index = 0; index < baselineGeometry.length; index += 1) {
  const expected = baselineGeometry[index];
  const actual = electronGeometry[index];
  assert(
    expected !== undefined &&
      actual !== undefined &&
      Math.abs(expected - actual) <= 0.01,
    `Electron geometry differs at vector index ${index}`,
  );
}

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgTexts = await Promise.all(
  Object.keys(imported.renames).map(async (original) =>
    extractSvgText(await readFile(resolve(fixtureRoot, original), "utf8")),
  ),
);
const expected = buildExpectedBlocks(imported.document, svgTexts);
const template = validateTemplate(
  JSON.parse(
    await readFile(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
);
assert(template.ok, "frozen template must validate");
const firstPage = electron.evidence.pages[0];
assert(firstPage !== undefined, "Electron evidence has no page");
const context = {
  evidence: electron.evidence,
  expected,
  contentBox: contentBoxFromMargins(
    template.value.page.margin_mm,
    firstPage.widthPt,
    firstPage.heightPt,
  ),
  paginationRules: template.value.pagination_rules,
  headerText: imported.metadata["short_title"],
};
const p0 = runP0Checks(context);
const p1 = runP1Checks(context);
assert(p0.findings.length === 0, "Electron PDF has P0 findings");
assert(p1.findings.length === 0, "Electron PDF has P1 findings");

process.stdout.write(
  `${JSON.stringify({
    pageCount: electron.evidence.pages.length,
    fontsEmbedded: true,
    geometryTolerancePt: 0.01,
    p0Findings: p0.findings.length,
    p1Findings: p1.findings.length,
  })}\n`,
);
