/**
 * 基线集成测试：对 PA-05 签署基线 PDF 做真实提取（真实解析器 + 真实文件，零 mock）。
 * 覆盖验收①（全要素齐备）、③（文本逐字对账，承接 PA-05 归一口径）、④（失败分类正反）。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import {
  assertPdfReconciled,
  buildExpectedPdfText,
  extractSvgText,
} from "@wenshu/pdf-export";

import { extractEvidence } from "../src/extract-evidence.ts";
import type { WenshuPdfEvidence } from "../src/generated/evidence.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
// 签署基线的不可变副本随包提交（test-results/ 不入库，CI 无原件）；
// SHA-256 锚定与 PA-05 签署身份逐位一致，杜绝双源漂移。
const baselinePath = resolve(
  import.meta.dirname,
  "..",
  "fixtures",
  "baseline",
  "golden-report-baseline.pdf",
);
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");

/** PA-05 签署基线身份（附录 A 逐位确认）：防对错 PDF 出证据。 */
const SIGNED_BASELINE_SHA256 =
  "d18da69f4663c694f2dcea738ca9cabbaa2f16fac03d10eaf434efceaece6dfd";
const A4_PT = { width: 595.28, height: 841.89 } as const;
const A4_TOLERANCE_PT = 1;

const baselineBytes = new Uint8Array(readFileSync(baselinePath));

function loadEvidence(): WenshuPdfEvidence {
  assert.equal(
    createHash("sha256").update(baselineBytes).digest("hex"),
    SIGNED_BASELINE_SHA256,
    "baseline pdf bytes must be the PA-05 signed artifact",
  );
  const result = extractEvidence(baselineBytes);
  assert.ok(result.ok, "signed baseline must extract without failure");
  return result.evidence;
}

const evidence = loadEvidence();

test("evidence anchors source identity: sha256, page count, Skia producer", () => {
  assert.equal(evidence.evidenceVersion, "1.0.0");
  assert.equal(evidence.source.sha256, SIGNED_BASELINE_SHA256);
  assert.equal(evidence.source.pageCount, 20);
  assert.match(evidence.source.producer, /^Skia\/PDF/);
});

test("all 20 pages carry A4 media boxes within the PA-05 tolerance", () => {
  assert.equal(evidence.pages.length, 20);
  for (const page of evidence.pages) {
    assert.ok(
      Math.abs(page.widthPt - A4_PT.width) <= A4_TOLERANCE_PT,
      `page ${page.index} width ${page.widthPt}`,
    );
    assert.ok(
      Math.abs(page.heightPt - A4_PT.height) <= A4_TOLERANCE_PT,
      `page ${page.index} height ${page.heightPt}`,
    );
    assert.equal(page.rotate, 0);
  }
});

test("text runs carry geometry, reading order and font references", () => {
  assert.ok(evidence.textRuns.length > 10_000, `runs=${evidence.textRuns.length}`);
  const page = evidence.pages[0];
  assert.ok(page !== undefined);
  for (const run of evidence.textRuns) {
    assert.ok(Number.isFinite(run.bbox.x) && Number.isFinite(run.bbox.y));
    assert.ok(run.bbox.width >= 0 && run.bbox.height > 0);
    assert.ok(run.fontSize > 0);
    assert.ok(run.font.objectId >= 1 && run.font.tag.length > 0);
    assert.ok(run.text.length > 0);
    // 几何必须落在页框内（提取事实边界，不是质量判定）。
    assert.ok(run.bbox.x >= -1 && run.bbox.x <= page.widthPt + 1);
    assert.ok(run.baselineY >= -1 && run.baselineY <= page.heightPt + 1);
  }
  // ActualText 语义面真实存在（PA-05 事实：图表区靠 ActualText 承载文本）。
  assert.ok(evidence.textRuns.some((run) => run.viaActualText));
  // 阅读序单调dense由契约校验保证；此处确认全局序与页序一致。
  assert.equal(evidence.textRuns[0]?.readingOrder, 0);
});

test("figures carry vector bboxes inside the page and structure-tree captions", () => {
  assert.equal(evidence.figures.length, 2);
  const captions = evidence.figures.map((figure) => figure.altShort ?? "");
  assert.ok(captions.some((caption) => caption.startsWith("图 1")));
  assert.ok(captions.some((caption) => caption.startsWith("图 2")));
  for (const figure of evidence.figures) {
    const page = evidence.pages[figure.pageIndex];
    assert.ok(page !== undefined);
    assert.ok(figure.kind === "vector-figure");
    assert.ok(figure.bbox.width > 0 && figure.bbox.height > 0);
    assert.ok(
      figure.bbox.x >= 0 && figure.bbox.x + figure.bbox.width <= page.widthPt + 1,
    );
    assert.ok(
      figure.bbox.y <= page.heightPt + 1 && figure.bbox.y - figure.bbox.height >= -1,
    );
    assert.ok((figure.altLong ?? "").length > 0);
  }
});

test("fonts are the frozen embedded subset faces only", () => {
  assert.ok(evidence.fonts.length > 0);
  for (const font of evidence.fonts) {
    assert.ok(font.embedded, font.name);
    assert.ok(font.subset, font.name);
    assert.match(font.name, /SourceHanSansCN|Noto-Sans-SC/u);
  }
});

test("evidence text reconciles verbatim with the document text (PA-05 rule)", async () => {
  const imported = await importMarkdownDocument(
    resolve(fixtureRoot, "golden-report.md"),
    fixtureRoot,
  );
  const svgTexts = await Promise.all(
    Object.keys(imported.renames).map(async (original) =>
      extractSvgText(readFileSync(resolve(fixtureRoot, original), "utf8")),
    ),
  );
  const expected = buildExpectedPdfText(imported.document, svgTexts);
  const extracted = [...evidence.textRuns]
    .sort((a, b) => a.readingOrder - b.readingOrder)
    .map((run) => run.text)
    .join("");
  // 归一口径（部首→CJK、合字、NFKC、去空白/Cf、跨页重绘表头跳过）逐字对账。
  assertPdfReconciled(extracted, expected.text, expected.repeatables);
});

interface CorruptManifestEntry {
  readonly file: string;
  readonly expectedCode: string;
  readonly sha256: string;
}

test("corrupt/encrypted/empty/foreign PDFs classify with stable codes, never empty evidence", () => {
  const manifestPath = resolve(
    import.meta.dirname,
    "..",
    "fixtures",
    "corrupt",
    "manifest.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    fixtures: CorruptManifestEntry[];
  };
  assert.ok(manifest.fixtures.length >= 5);
  for (const entry of manifest.fixtures) {
    const bytes = new Uint8Array(
      readFileSync(
        resolve(import.meta.dirname, "..", "fixtures", "corrupt", entry.file),
      ),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.sha256,
      `fixture ${entry.file} bytes drifted`,
    );
    const result = extractEvidence(bytes);
    assert.ok(!result.ok, `${entry.file} must not produce evidence`);
    assert.equal(result.issue.code, entry.expectedCode, entry.file);
    assert.ok(result.issue.location.length > 0);
    // 诊断不回显内容：issue 只含 code + 定位标签。
    assert.deepEqual(Object.keys(result.issue).sort(), ["code", "location"]);
  }
});

test("signed baseline never misclassifies into any failure code", () => {
  const result = extractEvidence(baselineBytes);
  assert.ok(result.ok);
});
