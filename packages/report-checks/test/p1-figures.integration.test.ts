/**
 * P1 图片域集成测试（PA-10）：真实签署基线（sha256 锚定）+ 内存派生
 * fault（不改冻结物）。覆盖验收①②③④：题注/来源孤立与比例失真检出+
 * 定位、基线 2 图零误报、分域猎杀（几何越界/遮挡只归 PA-07，图片规则
 * 零重判）、忠实对账与诚实门（*_REVIEW 绝不入 findings）。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { runP0Checks } from "../src/runner.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

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
const template = templateResult.value;
const firstPage = baselineEvidence.pages[0];
assert.ok(firstPage !== undefined);
const contentBox = contentBoxFromMargins(
  template.page.margin_mm,
  firstPage.widthPt,
  firstPage.heightPt,
);

function inputFor(evidence: WenshuPdfEvidence) {
  return {
    evidence,
    expected,
    contentBox,
    paginationRules: template.pagination_rules,
  };
}

/** 内存派生 fault：深拷贝后注入缺陷，冻结基线证据不受影响。 */
function derive(mutate: (draft: WenshuPdfEvidence) => void): WenshuPdfEvidence {
  const draft = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  mutate(draft);
  return draft;
}

/** 基线钉定（探针实测）：图 1 题注 ro 段与来源 ro 段。 */
const FIG1 = {
  page: 7,
  mcid: 0,
  captionRos: [3865, 3866, 3867] as readonly number[],
} as const;

function figureCodes(report: ReturnType<typeof runP1Checks>): string[] {
  return report.findings
    .filter((finding) => finding.ruleId.startsWith("p1-figure-"))
    .map((finding) => `${finding.code}@${finding.pageIndex}:${finding.nodeRef}`);
}

test("acceptance 2: signed baseline — 2 figures, zero auto findings, 2 honest legibility reviews", () => {
  const report = runP1Checks(inputFor(baselineEvidence));
  assert.deepEqual(figureCodes(report), []);
  const legibility = report.manualChecks.filter(
    (manual) => manual.code === "P1_FIGURE_LEGIBILITY_REVIEW",
  );
  assert.deepEqual(legibility.map((manual) => `${manual.nodeRef}`).sort(), [
    "figure:7:0",
    "figure:9:4",
  ]);
  // 基线钉数（探针实测）：成员 run 58/80，最小字号为图内刻度字号。
  const fig1 = legibility.find((manual) => manual.nodeRef === "figure:7:0");
  assert.equal(fig1?.basis.metrics["memberRunCount"], 58);
  const fig2 = legibility.find((manual) => manual.nodeRef === "figure:9:4");
  assert.equal(fig2?.basis.metrics["memberRunCount"], 80);
  // 图片域其余人工项（归属歧义/比例无源）在基线为零。
  assert.equal(
    report.manualChecks.filter(
      (manual) =>
        manual.ruleId.startsWith("p1-figure-") &&
        manual.code !== "P1_FIGURE_LEGIBILITY_REVIEW",
    ).length,
    0,
  );
});

test("acceptance 1: caption isolated to next page is detected and located to the figure", () => {
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (FIG1.captionRos.includes(run.readingOrder)) {
        run.pageIndex = 8;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(figureCodes(report), ["P1_FIGURE_CAPTION_SEPARATED@8:figure:7:0"]);
  const finding = report.findings[0];
  assert.equal(finding?.basis.metrics["figurePage"], 7);
  assert.equal(finding?.basis.metrics["captionPage"], 8);
  assert.equal(
    finding?.basis.metrics["templateFigureKeepWithCaption"],
    template.pagination_rules.figure_keep_with_caption ? 1 : 0,
  );
  assert.equal(template.pagination_rules.figure_keep_with_caption, true);
});

test("acceptance 1: source isolated to next page is detected and located", () => {
  // 图 1 来源段：题注末 ro 之后连续非成员 run（探针实测 ro 3868..3941）。
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (run.readingOrder >= 3868 && run.readingOrder <= 3941) {
        run.pageIndex = 8;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(figureCodes(report), ["P1_FIGURE_SOURCE_SEPARATED@7:figure:7:0"]);
  const finding = report.findings[0];
  assert.equal(finding?.basis.metrics["figurePage"], 7);
  assert.equal(finding?.basis.metrics["sourcePage"], 8);
});

test("acceptance 1: aspect distortion is detected with tolerance sourced metrics", () => {
  const fault = derive((draft) => {
    const figure = draft.figures.find((candidate) => candidate.mcid === 0);
    assert.ok(figure !== undefined);
    figure.paintBBox.width *= 1.15;
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(figureCodes(report), ["P1_FIGURE_ASPECT_DISTORTED@7:figure:7:0"]);
  const finding = report.findings[0];
  assert.ok(
    (finding?.basis.metrics["deviationMilli"] ?? 0) >
      (finding?.basis.metrics["toleranceMilli"] ?? 0),
  );
});

test("acceptance 4: altered figure legend text reconciles against source and is detected", () => {
  const fault = derive((draft) => {
    // 基线图内文本 run 为单字粒度（探针实测），「总」在成员中唯一。
    const run = draft.textRuns.find(
      (candidate) => candidate.figureMcid === 0 && candidate.text === "总",
    );
    assert.ok(run !== undefined, "baseline legend run must exist");
    run.text = "思";
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(figureCodes(report), ["P1_FIGURE_CONTENT_MISMATCH@7:figure:7:0"]);
});

test("acceptance 3 (division hunt): out-of-bounds figure is P0-only, figure rules stay silent", () => {
  const fault = derive((draft) => {
    const figure = draft.figures.find((candidate) => candidate.mcid === 0);
    assert.ok(figure !== undefined);
    figure.bbox.x = 590;
    figure.paintBBox.x = 590;
  });
  const p0 = runP0Checks(inputFor(fault));
  assert.ok(
    p0.findings.some(
      (finding) =>
        finding.code === "P0_OUT_OF_BOUNDS" && finding.nodeRef === "figure:7:0",
    ),
    "PA-07 must report the out-of-bounds figure",
  );
  const p1 = runP1Checks(inputFor(fault));
  assert.deepEqual(
    figureCodes(p1),
    [],
    "PA-10 must not re-judge PA-07 geometry domain",
  );
});

test("acceptance 3 (division hunt): text occluded by figure is P0-overlap only", () => {
  const fault = derive((draft) => {
    const figure = draft.figures.find((candidate) => candidate.mcid === 0);
    assert.ok(figure !== undefined);
    const template_run = draft.textRuns.find(
      (candidate) => candidate.pageIndex === 7 && candidate.figureMcid === null,
    );
    assert.ok(template_run !== undefined);
    // 非成员 run 完全落入 paintBBox（不骑缝）：PA-06B 判据下仍 P0_OVERLAP。
    draft.textRuns.push({
      ...template_run,
      text: "遮",
      readingOrder: 99999,
      blockOrder: 999,
      bbox: {
        x: figure.paintBBox.x + 10,
        y: figure.paintBBox.y - 10,
        width: 20,
        height: 20,
      },
    });
  });
  const p0 = runP0Checks(inputFor(fault));
  assert.ok(
    p0.findings.some((finding) => finding.code === "P0_OVERLAP"),
    "PA-07 must report the occlusion",
  );
  const p1 = runP1Checks(inputFor(fault));
  assert.deepEqual(figureCodes(p1), []);
});

test("honest gate: *_REVIEW codes never appear in findings across all faults", () => {
  const faults = [
    derive((draft) => {
      for (const run of draft.textRuns) {
        if (FIG1.captionRos.includes(run.readingOrder)) {
          run.pageIndex = 8;
        }
      }
    }),
    derive((draft) => {
      const figure = draft.figures.find((candidate) => candidate.mcid === 0);
      assert.ok(figure !== undefined);
      figure.paintBBox.width *= 1.15;
    }),
  ];
  for (const fault of faults) {
    const report = runP1Checks(inputFor(fault));
    assert.ok(report.findings.every((finding) => !finding.code.endsWith("_REVIEW")));
  }
});
