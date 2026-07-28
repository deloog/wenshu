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
  TOC_HEADING,
  assertPdfReconciled,
  buildExpectedPdfText,
  collectTocEntries,
  extractSvgText,
  measureTocPageNumbers,
  stripStampsForReconcile,
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

/** PA-11A 重签基线身份（VM run1 附录逐位确认）：防对错 PDF 出证据。 */
const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
const SIGNED_PAGE_COUNT = 21;
const A4_PT = { width: 595.28, height: 841.89 } as const;
const A4_TOLERANCE_PT = 1;

const baselineBytes = new Uint8Array(readFileSync(baselinePath));

function loadEvidence(): WenshuPdfEvidence {
  assert.equal(
    createHash("sha256").update(baselineBytes).digest("hex"),
    SIGNED_BASELINE_SHA256,
    "baseline pdf bytes must be the PA-11A signed artifact",
  );
  const result = extractEvidence(baselineBytes);
  assert.ok(result.ok, "signed baseline must extract without failure");
  return result.evidence;
}

const evidence = loadEvidence();

test("evidence anchors source identity: sha256, page count, Skia producer", () => {
  assert.equal(evidence.evidenceVersion, "1.1.0");
  assert.equal(evidence.source.sha256, SIGNED_BASELINE_SHA256);
  assert.equal(evidence.source.pageCount, SIGNED_PAGE_COUNT);
  assert.match(evidence.source.producer, /^Skia\/PDF/);
});

test("all 21 pages carry A4 media boxes within the PA-05 tolerance", () => {
  assert.equal(evidence.pages.length, SIGNED_PAGE_COUNT);
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

test("figure membership and painted extent are parse-time facts (decision #10)", () => {
  // PA-11A 重签后形态事实（探针 probe-pa11a-baseline.ts 实测）：目录独立成页
  // 使两 figure 页位 +1（7→8、9→10）；bbox 仍是版心全域（SVG 根 clip 矩形
  // 撑起），绘制框 paintBBox 只是图表区；图表标签是 span 成员，正文 run
  // 全部非成员，且没有任何非成员 run 与 paintBBox 显著重叠——这是 PA-07
  // 成员制豁免下基线仍 0 P0 的证据侧前提。
  const expected = new Map([
    [
      8,
      {
        mcid: 0,
        members: 58,
        paint: { x: 87.01, top: 784.92, width: 421.48, height: 238.84 },
      },
    ],
    [
      10,
      {
        mcid: 4,
        members: 80,
        paint: { x: 87.0, top: 553.92, width: 421.5, height: 182.65 },
      },
    ],
  ]);
  assert.equal(evidence.figures.length, 2);
  for (const figure of evidence.figures) {
    const pin = expected.get(figure.pageIndex);
    assert.ok(pin !== undefined, `unexpected figure page ${figure.pageIndex}`);
    assert.equal(figure.mcid, pin.mcid);
    // bbox 为版心全域（既有语义，clip  inclusive）；paintBBox 远小于 bbox。
    assert.ok(figure.bbox.height > 700, `bbox height ${figure.bbox.height}`);
    assert.ok(
      figure.paintBBox.height < figure.bbox.height / 2,
      `paint height ${figure.paintBBox.height} vs bbox ${figure.bbox.height}`,
    );
    assert.ok(Math.abs(figure.paintBBox.x - pin.paint.x) < 1);
    assert.ok(Math.abs(figure.paintBBox.y - pin.paint.top) < 1);
    assert.ok(Math.abs(figure.paintBBox.width - pin.paint.width) < 1);
    assert.ok(Math.abs(figure.paintBBox.height - pin.paint.height) < 1);

    const pageRuns = evidence.textRuns.filter(
      (run) => run.pageIndex === figure.pageIndex,
    );
    const members = pageRuns.filter((run) => run.figureMcid === figure.mcid);
    const nonMembers = pageRuns.filter((run) => run.figureMcid === null);
    assert.equal(members.length, pin.members, `members on page ${figure.pageIndex}`);
    assert.equal(members.length + nonMembers.length, pageRuns.length);
    // 非成员 run 与绘制框零显著重叠（>0.5pt² 即显著）。
    const px0 = figure.paintBBox.x;
    const py1 = figure.paintBBox.y;
    const px1 = px0 + figure.paintBBox.width;
    const py0 = py1 - figure.paintBBox.height;
    const hits = nonMembers.filter((run) => {
      const ix = Math.min(run.bbox.x + run.bbox.width, px1) - Math.max(run.bbox.x, px0);
      const iy =
        Math.min(run.bbox.y, py1) - Math.max(run.bbox.y - run.bbox.height, py0);
      return ix > 0 && iy > 0 && ix * iy > 0.5;
    });
    assert.equal(hits.length, 0, `overlaps on page ${figure.pageIndex}`);
  }
  // figure 页之外没有任何成员标记。
  assert.ok(
    evidence.textRuns.every(
      (run) => run.figureMcid === null || run.pageIndex === 8 || run.pageIndex === 10,
    ),
  );
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
  // PA-11A 口径：目录页码从签署基线大纲实测注入期望文本（页码禁手写）；
  const tocEntries = collectTocEntries(imported.document);
  const expected = buildExpectedPdfText(imported.document, svgTexts, {
    heading: TOC_HEADING,
    entries: tocEntries,
    pages: measureTocPageNumbers(baselineBytes, tocEntries),
  });
  // 证据 run 逐页拼接（页内按阅读序），压印页眉页脚以位置锚定剥离后对账——
  // 与管线终稿自核验同一口径（stamp spec 全部由冻结模板/文档元数据派生）。
  const template = JSON.parse(
    readFileSync(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ) as { page: { margin_mm: { top: number; bottom: number; left: number } } };
  const MM_TO_PT = 72 / 25.4;
  const firstPage = evidence.pages[0];
  assert.ok(firstPage !== undefined);
  const pageTexts = evidence.pages.map((page) =>
    evidence.textRuns
      .filter((run) => run.pageIndex === page.index)
      .sort((a, b) => a.readingOrder - b.readingOrder)
      .map((run) => run.text)
      .join(""),
  );
  const extracted = stripStampsForReconcile(pageTexts, {
    headerText: imported.metadata["short_title"] ?? "",
    pageWidthPt: firstPage.widthPt,
    pageHeightPt: firstPage.heightPt,
    marginTopPt: template.page.margin_mm.top * MM_TO_PT,
    marginBottomPt: template.page.margin_mm.bottom * MM_TO_PT,
    marginLeftPt: template.page.margin_mm.left * MM_TO_PT,
  });
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
