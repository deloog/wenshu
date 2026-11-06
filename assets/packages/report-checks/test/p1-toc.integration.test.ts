/**
 * P1 目录/页码集成测试（PA-11B）：真实签署基线（sha256 锚定）+ 真实冻结
 * 模板 + 内存派生 fault（不改冻结物）。覆盖验收①②③④⑤：目录缺项/多余
 * 项/页码指错页/标题未入目录各被检出并定位、基线（TOC 36/36 正确）零
 * 误报、双向对账与实际页码红线（实际页只从证据读）、同名/未归属歧义
 * fail-closed 降人工、回滚与诚实门（*_REVIEW 绝不入 findings）。
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
import { attributeBlocks } from "../src/p1-attribution.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");

const baselineBytes = new Uint8Array(
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
  templateResult.value.page.margin_mm,
  firstPage.widthPt,
  firstPage.heightPt,
);

function inputFor(evidence: WenshuPdfEvidence) {
  return {
    evidence,
    expected,
    contentBox,
    paginationRules: template.pagination_rules,
    headerText: imported.metadata["short_title"],
  };
}

function derive(mutate: (draft: WenshuPdfEvidence) => void): WenshuPdfEvidence {
  const draft = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  mutate(draft);
  return draft;
}

/** 基线钉定（探针实测）：条目 tocIndex 7（2.2 任务边界）渲染 run 区间与配对 ref。 */
const TOC_PAGE = 3;
const ENTRY7_REF = "/blocks/1/children/6/entries/7";
const HEAD7_REF = "/blocks/3/children/1";
const ENTRY7_RUN_ROS = [
  1330, 1331, 1332, 1333, 1334, 1335, 1336, 1337, 1338, 1339, 1340, 1341,
];
const ENTRY0_LABEL_RO = 1232;
const ENTRY0_REF = "/blocks/1/children/6/entries/0";
const HEAD0_REF = "/blocks/1";

function tocFindings(report: ReturnType<typeof runP1Checks>): string[] {
  return report.findings
    .filter((finding) => finding.ruleId.startsWith("p1-toc-"))
    .map((finding) => `${finding.code}@${finding.pageIndex}:${finding.nodeRef}`);
}

test("acceptance 2: signed baseline — 36 entries reconcile, zero toc findings/manuals", () => {
  const report = runP1Checks(inputFor(baselineEvidence));
  assert.deepEqual(tocFindings(report), []);
  assert.equal(
    report.manualChecks.filter((manual) => manual.ruleId.startsWith("p1-toc-")).length,
    0,
  );
  // 编号偏移正确处理（cover_own_page/toc_start_new_page 只布局分页，编号
  // = pageIndex+1 物理页码）：基线 36/36 全对 → 零发现即证。
});

test("acceptance 1: missing toc entry is detected and located to entry+heading refs", () => {
  // 删除条目 7 全部渲染 run（marker+标题+标注）→ 应入目录的标题无目录项。
  const removed = new Set(ENTRY7_RUN_ROS);
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.filter((run) => !removed.has(run.readingOrder));
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_TOC_ENTRY_MISSING",
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 5)));
  assert.equal(hits[0]?.pageIndex, TOC_PAGE);
  assert.equal(hits[0]?.nodeRef, ENTRY7_REF);
  assert.equal(hits[0]?.basis.relatedNodeRef, HEAD7_REF);
  assert.equal(hits[0]?.basis.metrics["tocIndex"], 7);
  // 缺项条目不再重复降人工（page-match 侧 skip）。
  assert.ok(report.manualChecks.every((manual) => manual.nodeRef !== ENTRY7_REF));
});

test("acceptance 1: extra toc entry line is detected as P1_TOC_ENTRY_EXTRA", () => {
  // 目录区尾部注入一行「伪造条目+页码」run（未被任何期望块覆盖）。
  const fault = derive((draft) => {
    const template_run = draft.textRuns.find(
      (run) => run.pageIndex === TOC_PAGE && run.text === "伪",
    );
    const anchor =
      template_run ?? draft.textRuns.find((run) => run.pageIndex === TOC_PAGE);
    assert.ok(anchor !== undefined);
    const texts = ["伪", "造", "条", "目", "9"];
    texts.forEach((text, index) => {
      draft.textRuns.push({
        ...anchor,
        text,
        readingOrder: 1796.01 + index * 0.01,
        blockOrder: 900,
        pageIndex: TOC_PAGE,
        baselineY: 60,
        bbox: { x: 57 + index * 11, y: 60, width: 10, height: 12 },
      });
    });
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_TOC_ENTRY_EXTRA",
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 5)));
  assert.equal(hits[0]?.pageIndex, TOC_PAGE);
  assert.ok(hits[0]?.nodeRef.startsWith("run:1796"));
});

test("acceptance 1: toc label pointing at a wrong page is detected (printed vs actual)", () => {
  // 目录页码指错页：条目 0 标注「3」→「9」（实际页不变）。
  const fault = derive((draft) => {
    const label = draft.textRuns.find((run) => run.readingOrder === ENTRY0_LABEL_RO);
    assert.ok(label !== undefined && label.text === "3");
    label.text = "9";
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_TOC_PAGE_MISMATCH",
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 5)));
  assert.equal(hits[0]?.nodeRef, ENTRY0_REF);
  assert.equal(hits[0]?.basis.relatedNodeRef, HEAD0_REF);
  assert.equal(hits[0]?.basis.metrics["printedPage"], 9);
  assert.equal(hits[0]?.basis.metrics["actualPage"], 3);
});

test("acceptance 1+3 (red line): moving the real heading page flips actual side, label unchanged is caught", () => {
  // 实际页码红线：实际页只从证据读——把正文标题 run 移到次页（模拟分页
  // 漂移/硬编码对侧），标注未变即检出 printed(6) !== actual(7)。
  const attribution = attributeBlocks(baselineEvidence, expected);
  const heading = attribution.matched.find((entry) => entry.block.ref === HEAD7_REF);
  assert.ok(heading !== undefined);
  const ros = new Set(
    heading.runIndexes.map((runIndex) => {
      const run = attribution.orderedRuns[runIndex];
      assert.ok(run !== undefined && run.pageIndex === 5);
      return run.readingOrder;
    }),
  );
  const fault = derive((draft) => {
    for (const run of draft.textRuns) {
      if (ros.has(run.readingOrder)) {
        run.pageIndex = 6;
      }
    }
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) =>
      finding.code === "P1_TOC_PAGE_MISMATCH" && finding.nodeRef === ENTRY7_REF,
  );
  assert.equal(hits.length, 1, JSON.stringify(report.findings.slice(0, 8)));
  assert.equal(hits[0]?.basis.metrics["printedPage"], 6);
  assert.equal(hits[0]?.basis.metrics["actualPage"], 7);
});

test("acceptance 4 (honest gate): indeterminate actual page degrades to manual, never guessed", () => {
  // 把标题最后一个 run 移到下一页 → 标题仍归属但跨页（实际页不可判定）
  // → P1_TOC_PAGE_REVIEW 降人工，不以残留标注冒充实际（fail-closed，不猜不藏）。
  // 注：不采用「删除标题文本」fault——PA-08 反向游标归属对未匹配块级联
  // fail-closed，其前的全部块（含整个目录域）随之不可归属，由
  // p1-toc-reconcile 统一降 /toc 人工，条目级 REVIEW 不可达；跨页 fault
  // 保持归属完整，才隔离出「实际页不可判定」单变量。
  const attribution = attributeBlocks(baselineEvidence, expected);
  const heading = attribution.matched.find((entry) => entry.block.ref === HEAD7_REF);
  assert.ok(heading !== undefined);
  const lastRun =
    attribution.orderedRuns[
      heading.runIndexes[heading.runIndexes.length - 1] as number
    ];
  assert.ok(lastRun !== undefined);
  const fault = derive((draft) => {
    const moved = draft.textRuns.find(
      (run) => run.readingOrder === lastRun.readingOrder,
    );
    assert.ok(moved !== undefined);
    moved.pageIndex = lastRun.pageIndex + 1;
  });
  const report = runP1Checks(inputFor(fault));
  assert.ok(
    report.findings.every(
      (finding) => finding.nodeRef !== ENTRY7_REF && !finding.code.startsWith("P1_TOC"),
    ),
  );
  const reviews = report.manualChecks.filter(
    (manual) => manual.code === "P1_TOC_PAGE_REVIEW" && manual.nodeRef === ENTRY7_REF,
  );
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.basis.metrics["headingMatched"], 1);
});

test("acceptance 5: per-rule rollback isolates toc rules; *_REVIEW never in findings", () => {
  const fault = derive((draft) => {
    const label = draft.textRuns.find((run) => run.readingOrder === ENTRY0_LABEL_RO);
    assert.ok(label !== undefined);
    label.text = "9";
  });
  const full = runP1Checks(inputFor(fault));
  assert.ok(full.findings.some((finding) => finding.code === "P1_TOC_PAGE_MISMATCH"));
  const rolledBack = runP1Checks(inputFor(fault), {
    disabledRules: ["p1-toc-page-match"],
  });
  assert.ok(
    rolledBack.findings.every((finding) => finding.ruleId !== "p1-toc-page-match"),
  );
  assert.ok(
    rolledBack.rules.includes("p1-toc-reconcile") &&
      !rolledBack.rules.includes("p1-toc-page-match"),
  );
  // 诚实门：全部 fault 下 *_REVIEW 绝不入 findings。
  for (const candidate of [full, rolledBack]) {
    assert.ok(candidate.findings.every((finding) => !finding.code.endsWith("_REVIEW")));
  }
  // 确定性 + 不回显正文。
  const first = JSON.stringify(runP1Checks(inputFor(fault)));
  assert.equal(first, JSON.stringify(runP1Checks(inputFor(fault))));
  assert.ok(!first.includes("执行摘要"));
});
