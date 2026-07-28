/**
 * P1 集成测试（PA-08）：真实签署基线证据（PA-06 规范生产器）+ 真实冻结
 * 模板（validateTemplate 受控路径，禁内联断言）+ 内存派生 fault（不改
 * 冻结物）。覆盖验收①②③④：单故障检出+定位、基线误报有界（0 自动发现，
 * 人工核验项书面钉数）、灰区如实降人工、阈值可溯源到冻结模板。
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
import { attributeBlocks, bodyRunIndexesOnPage } from "../src/p1-attribution.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
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
const svgTexts = svgSources.map((source) => extractSvgText(source));
const svgAspects = svgSources.map((source) => extractSvgAspectRatio(source));
const expected = buildExpectedBlocks(imported.document, svgTexts, svgAspects);

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
const paginationRules = template.pagination_rules;

function inputFor(evidence: WenshuPdfEvidence) {
  return { evidence, expected, contentBox, paginationRules };
}

/** 内存派生 fault：深拷贝后注入缺陷，冻结基线证据不受影响。 */
function derive(mutate: (draft: WenshuPdfEvidence) => void): WenshuPdfEvidence {
  const draft = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  mutate(draft);
  return draft;
}

/** 指定块在指定页的正文 run（readingOrder 值），供 fault 注入移动。 */
function readingOrdersOfBlockOnPage(
  evidence: WenshuPdfEvidence,
  blockRef: string,
  pageIndex: number,
): number[] {
  const attribution = attributeBlocks(evidence, expected);
  const entry = attribution.matched.find(
    (candidate) => candidate.block.ref === blockRef,
  );
  assert.ok(entry !== undefined, `block ${blockRef} must attribute on baseline`);
  return bodyRunIndexesOnPage(attribution, entry, pageIndex).map((runIndex) => {
    const run = attribution.orderedRuns[runIndex];
    assert.ok(run !== undefined);
    return run.readingOrder;
  });
}

/** 执行摘要首段：基线上在 p2 有 6 行（探针实测），是注入分裂/搬移的载体。 */
const BODY_BLOCK_REF = "/blocks/1/children/0";
const BODY_HEADING_REF = "/blocks/1";

test("acceptance 2: signed baseline yields zero P1 findings; manual items bounded", () => {
  const report = runP1Checks(inputFor(baselineEvidence));
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.rules, [
    "p1-heading-keep",
    "p1-orphan",
    "p1-widow",
    "p1-sparse-page",
    "p1-table-header-repeat",
    "p1-table-row-split",
    "p1-figure-caption",
    "p1-figure-source",
    "p1-figure-aspect",
    "p1-figure-fidelity",
    "p1-figure-legibility",
  ]);
  // 有界人工核验（书面钉数，基线 sha 锚定故稳定）：标题保留下续灰区 10 项
  // （8 例标题后接 1 行子标题 + 2 例标题后接单行完整段落，均为 PA-04 注册
  // 近似与模板 keepN=2 意图之差）；逐页密度证据 21 项（= 页数，PA-11A
  // 重签后 20 → 21 页）；PA-10 图片诚实门 2 项清晰度人工核验（基线 2 图，
  // 无确定性判据如实降人工，台账 PA-10-followups 承接 PA-J1）。
  // 钉数：10 + 21 + 2 = 33。
  const headingReviews = report.manualChecks.filter(
    (manual) => manual.code === "P1_HEADING_KEEP_REVIEW",
  );
  const densityReviews = report.manualChecks.filter(
    (manual) => manual.code === "P1_SPARSE_DENSITY_REVIEW",
  );
  const legibilityReviews = report.manualChecks.filter(
    (manual) => manual.code === "P1_FIGURE_LEGIBILITY_REVIEW",
  );
  assert.equal(headingReviews.length, 10);
  assert.equal(densityReviews.length, baselineEvidence.pages.length);
  assert.equal(legibilityReviews.length, 2);
  assert.equal(report.manualChecks.length, 33);
});

test("acceptance 3: gray zone is manual-only with static reasons, never disguised as pass", () => {
  const report = runP1Checks(inputFor(baselineEvidence));
  // 灰区标题（封面章 H1，后继子标题仅 1 行同页）出现在人工核验，而非发现。
  assert.ok(
    report.manualChecks.some(
      (manual) =>
        manual.code === "P1_HEADING_KEEP_REVIEW" &&
        manual.nodeRef === "/blocks/0" &&
        manual.basis.metrics["followingLinesOnPage"] === 1,
    ),
  );
  assert.ok(report.findings.every((finding) => finding.nodeRef !== "/blocks/0"));
  // 每条人工核验都必须带静态口径 reason（无动态内容、无伪装自动判定）。
  const reasons = new Set(report.manualChecks.map((manual) => manual.reason));
  assert.equal(reasons.size, 3);
  for (const reason of reasons) {
    assert.ok(reason.length > 0 && reason.length <= 200);
  }
  assert.ok(
    report.manualChecks.every((manual) =>
      [
        "P1_HEADING_KEEP_REVIEW",
        "P1_SPARSE_DENSITY_REVIEW",
        "P1_FIGURE_LEGIBILITY_REVIEW",
      ].includes(manual.code),
    ),
  );
});

test("acceptance 1: heading separated from body is detected at the right page/block", () => {
  const orders = readingOrdersOfBlockOnPage(baselineEvidence, BODY_BLOCK_REF, 2);
  assert.ok(orders.length >= 6);
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (orders.includes(run.readingOrder)) {
        run.pageIndex = 3;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(
    report.findings.map(
      (finding) => `${finding.code}@${finding.pageIndex}:${finding.nodeRef}`,
    ),
    [`P1_HEADING_SEPARATED@2:${BODY_HEADING_REF}`],
  );
  assert.equal(report.findings[0]?.basis.relatedNodeRef, BODY_BLOCK_REF);
  assert.equal(report.findings[0]?.basis.metrics["followingLinesOnPage"], 0);
});

test("acceptance 1+4: orphan fault is detected; threshold traces to frozen template", () => {
  const orders = readingOrdersOfBlockOnPage(baselineEvidence, BODY_BLOCK_REF, 2);
  const attribution = attributeBlocks(baselineEvidence, expected);
  const entry = attribution.matched.find(
    (candidate) => candidate.block.ref === BODY_BLOCK_REF,
  );
  assert.ok(entry !== undefined);
  const runsOnPage = bodyRunIndexesOnPage(attribution, entry, 2).map((runIndex) => {
    const run = attribution.orderedRuns[runIndex];
    assert.ok(run !== undefined);
    return run;
  });
  // y 向上：首行 baseline 最大。保留首行在 p2（寡行），其余移到 p3。
  const maxBaseline = Math.max(...runsOnPage.map((run) => run.baselineY));
  const keep = new Set(
    runsOnPage
      .filter((run) => Math.abs(run.baselineY - maxBaseline) <= 2)
      .map((run) => run.readingOrder),
  );
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (orders.includes(run.readingOrder) && !keep.has(run.readingOrder)) {
        run.pageIndex = 3;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(
    report.findings.map(
      (finding) => `${finding.code}@${finding.pageIndex}:${finding.nodeRef}`,
    ),
    [`P1_ORPHAN@2:${BODY_BLOCK_REF}`],
  );
  assert.equal(report.findings[0]?.basis.metrics["linesAtPageEnd"], 1);
  assert.equal(
    report.findings[0]?.basis.metrics["templateOrphans"],
    paginationRules.orphans,
  );
  assert.equal(paginationRules.orphans, 2);
});

test("acceptance 1+4: widow fault is detected; threshold traces to frozen template", () => {
  const attribution = attributeBlocks(baselineEvidence, expected);
  const entry = attribution.matched.find(
    (candidate) => candidate.block.ref === BODY_BLOCK_REF,
  );
  assert.ok(entry !== undefined);
  const runsOnPage = bodyRunIndexesOnPage(attribution, entry, 2).map((runIndex) => {
    const run = attribution.orderedRuns[runIndex];
    assert.ok(run !== undefined);
    return run;
  });
  // 末行（baseline 最小）移到下页页首 → 孤行。
  const minBaseline = Math.min(...runsOnPage.map((run) => run.baselineY));
  const move = new Set(
    runsOnPage
      .filter((run) => Math.abs(run.baselineY - minBaseline) <= 2)
      .map((run) => run.readingOrder),
  );
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (move.has(run.readingOrder)) {
        run.pageIndex = 3;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(
    report.findings.map(
      (finding) => `${finding.code}@${finding.pageIndex}:${finding.nodeRef}`,
    ),
    [`P1_WIDOW@3:${BODY_BLOCK_REF}`],
  );
  assert.equal(report.findings[0]?.basis.metrics["linesAtPageStart"], 1);
  assert.equal(
    report.findings[0]?.basis.metrics["templateWidows"],
    paginationRules.widows,
  );
  assert.equal(paginationRules.widows, 2);
});

test("acceptance 2: split exactly at the template threshold is not flagged", () => {
  const orders = readingOrdersOfBlockOnPage(baselineEvidence, BODY_BLOCK_REF, 2);
  const attribution = attributeBlocks(baselineEvidence, expected);
  const entry = attribution.matched.find(
    (candidate) => candidate.block.ref === BODY_BLOCK_REF,
  );
  assert.ok(entry !== undefined);
  const runsOnPage = bodyRunIndexesOnPage(attribution, entry, 2).map((runIndex) => {
    const run = attribution.orderedRuns[runIndex];
    assert.ok(run !== undefined);
    return run;
  });
  // 末两行移到下页：页尾 4 行（≥orphans）+ 页首 2 行（=widows）→ 合法。
  const baselines = [...new Set(runsOnPage.map((run) => run.baselineY))].sort(
    (a, b) => a - b,
  );
  const moveBaselines = baselines.slice(0, 2);
  const move = new Set(
    runsOnPage
      .filter((run) =>
        moveBaselines.some((baseline) => Math.abs(run.baselineY - baseline) <= 2),
      )
      .map((run) => run.readingOrder),
  );
  assert.ok(move.size > 0 && move.size < orders.length);
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (move.has(run.readingOrder)) {
        run.pageIndex = 3;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  assert.ok(
    report.findings.every(
      (finding) => finding.code !== "P1_ORPHAN" && finding.code !== "P1_WIDOW",
    ),
    JSON.stringify(report.findings),
  );
});

test("acceptance 1: zero-content page is detected as P1_EMPTY_PAGE at the right page", () => {
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.filter((run) => run.pageIndex !== 5);
    draft.figures = draft.figures.filter((figure) => figure.pageIndex !== 5);
  });
  const report = runP1Checks(inputFor(fault));
  assert.deepEqual(
    report.findings.map((finding) => `${finding.code}@${finding.pageIndex}`),
    ["P1_EMPTY_PAGE@5"],
    JSON.stringify(report.findings.slice(0, 5)),
  );
});

test("acceptance 1+3: partial sparse fault stays manual with honest density evidence", () => {
  const baselineReport = runP1Checks(inputFor(baselineEvidence));
  // PA-11A 重签后 p8 为图 1 所在页（图区覆盖率高，半数 run 移除不足以
  // 诚实反映密度下降）；改在纯文本页 p9 注入（探针实测 coverageRatio
  // 0.3036 → 0.1511 < 0.7 倍阈值）。
  const baselinePage9 = baselineReport.manualChecks.find(
    (manual) => manual.code === "P1_SPARSE_DENSITY_REVIEW" && manual.pageIndex === 9,
  );
  assert.ok(baselinePage9 !== undefined);
  const fault = derive((draft) => {
    // 移除 p9 半数文本 run：页变稀但不空——主观稀疏带，绝不出自动判定。
    let seen = 0;
    draft.textRuns = draft.textRuns.filter((run) => {
      if (run.pageIndex !== 9) {
        return true;
      }
      seen += 1;
      return seen % 2 === 0;
    });
  });
  const report = runP1Checks(inputFor(fault));
  assert.ok(report.findings.every((finding) => finding.ruleId !== "p1-sparse-page"));
  const review = report.manualChecks.find(
    (manual) => manual.code === "P1_SPARSE_DENSITY_REVIEW" && manual.pageIndex === 9,
  );
  assert.ok(review !== undefined, "density evidence must still locate page 9");
  const before = baselinePage9.basis.metrics["coverageRatio"];
  const after = review.basis.metrics["coverageRatio"];
  assert.ok(before !== undefined && after !== undefined);
  assert.ok(after < before * 0.7, `density must drop honestly (${after} vs ${before})`);
  assert.equal(
    review.basis.metrics["templateMaxConsecutiveSparsePages"],
    paginationRules.max_consecutive_sparse_pages,
  );
});

test("acceptance 5: per-rule rollback on multi-fault input; determinism; no content echo", () => {
  const orders = readingOrdersOfBlockOnPage(baselineEvidence, BODY_BLOCK_REF, 2);
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (orders.includes(run.readingOrder)) {
        run.pageIndex = 3;
      } else if (run.pageIndex === 5) {
        // 造空页用搬移而非删除：归属命门反向文档序游标在中段出现内容
        // 空洞时 fail-closed 丢弃前序块（含 /blocks/1），标题检出会随之
        // 消失——那是归属歧义的如实降级，非检出缺口；搬移保持游标完整。
        run.pageIndex = 6;
      }
    }
    draft.figures = draft.figures.filter((figure) => figure.pageIndex !== 5);
  });
  const full = runP1Checks(inputFor(fault));
  assert.ok(full.findings.some((finding) => finding.code === "P1_HEADING_SEPARATED"));
  assert.ok(full.findings.some((finding) => finding.code === "P1_EMPTY_PAGE"));
  const rolledBack = runP1Checks(inputFor(fault), {
    disabledRules: ["p1-sparse-page"],
  });
  assert.ok(
    rolledBack.findings.some((finding) => finding.code === "P1_HEADING_SEPARATED"),
  );
  assert.ok(
    rolledBack.findings.every((finding) => finding.ruleId !== "p1-sparse-page"),
  );
  assert.ok(
    rolledBack.manualChecks.every((manual) => manual.ruleId !== "p1-sparse-page"),
  );

  const first = JSON.stringify(runP1Checks(inputFor(fault)));
  const second = JSON.stringify(runP1Checks(inputFor(fault)));
  assert.equal(first, second);
  // 诊断不回显正文（基线标题标志串）。
  assert.ok(!first.includes("AI 辅助长文"));
});
