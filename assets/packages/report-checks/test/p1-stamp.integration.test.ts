/**
 * P1 页眉页脚压印一致性集成测试（PA-11B）：真实签署基线（sha256 锚定）
 * + 真实冻结模板 + 内存派生 fault（不改冻结物）。覆盖验收②：页脚页码
 * === pageIndex+1（封面例外）、页眉 === short_title 声明值、缺页眉/缺页脚/
 * 位置带外/封面压印各被检出并定位、基线（40 压印 run 全对）零误报、
 * 压印识别共用 stamp-scope 单源口径（font tag 前缀，禁几何启发式）、
 * 输入缺 headerText 时文本对账诚实降人工、回滚与分域（*_REVIEW 绝不入
 * findings，压印判定不引发内容域重判）。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { validateTemplate } from "@wenshu/template-model";

import { contentBoxFromMargins } from "../src/layout.ts";
import { runP1Checks } from "../src/p1-runner.ts";
import { selectStampRuns } from "../src/stamp-scope.ts";

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
    expected: [],
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

/** 基线钉定（探针实测）：p4（pageIndex 4）页眉/页脚压印 run。 */
const P4_HEADER_RO = 2667;
const P4_FOOTER_RO = 2668;

function stampFindings(report: ReturnType<typeof runP1Checks>): string[] {
  return report.findings
    .filter((finding) => finding.ruleId === "p1-stamp-consistency")
    .map((finding) => `${finding.code}@${finding.pageIndex}:${finding.nodeRef}`);
}

function mutateStamp(
  readingOrder: number,
  mutate: (run: TextRun) => void,
): WenshuPdfEvidence {
  return derive((draft) => {
    const run = draft.textRuns.find((item) => item.readingOrder === readingOrder);
    assert.ok(run !== undefined, `stamp run ro ${readingOrder} must exist`);
    mutate(run);
  });
}

test("acceptance 2: signed baseline — 40 stamp runs on pages 1..20, zero findings/manuals", () => {
  const stamps = selectStampRuns(baselineEvidence);
  assert.equal(stamps.length, 40);
  assert.equal(stamps.filter((run) => run.pageIndex === 0).length, 0);
  const report = runP1Checks(inputFor(baselineEvidence));
  assert.deepEqual(stampFindings(report), []);
  assert.equal(
    report.manualChecks.filter((manual) => manual.ruleId === "p1-stamp-consistency")
      .length,
    0,
  );
});

test("acceptance 2: footer page number drift (printed vs physical) is detected with metrics", () => {
  // 页脚错码："5 / 21" → "6 / 21"；物理页 pageIndex+1=5 从证据读，不猜。
  const fault = mutateStamp(P4_FOOTER_RO, (run) => {
    run.text = "6 / 21";
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_FOOTER_PAGE_MISMATCH" && finding.pageIndex === 4,
  );
  assert.equal(hits.length, 1, JSON.stringify(stampFindings(report)));
  assert.equal(hits[0]?.nodeRef, `run:${P4_FOOTER_RO}`);
  assert.equal(hits[0]?.basis.metrics["expectedPage"], 5);
  assert.equal(hits[0]?.basis.metrics["actualPage"], 6);
  assert.equal(hits[0]?.basis.metrics["expectedTotal"], 21);
  assert.equal(hits[0]?.basis.metrics["actualTotal"], 21);
});

test("acceptance 2: footer total drift is detected", () => {
  const fault = mutateStamp(P4_FOOTER_RO, (run) => {
    run.text = "5 / 20";
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_FOOTER_PAGE_MISMATCH" && finding.pageIndex === 4,
  );
  assert.equal(hits.length, 1, JSON.stringify(stampFindings(report)));
  assert.equal(hits[0]?.basis.metrics["expectedTotal"], 21);
  assert.equal(hits[0]?.basis.metrics["actualTotal"], 20);
});

test("acceptance 2: missing footer on a non-cover page is detected and located", () => {
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.filter((run) => run.readingOrder !== P4_FOOTER_RO);
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_FOOTER_MISSING",
  );
  assert.equal(hits.length, 1, JSON.stringify(stampFindings(report)));
  assert.equal(hits[0]?.pageIndex, 4);
  assert.equal(hits[0]?.nodeRef, "page:4");
  assert.equal(hits[0]?.basis.metrics["expectedPage"], 5);
});

test("acceptance 2: missing header on a non-cover page is detected and located", () => {
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.filter((run) => run.readingOrder !== P4_HEADER_RO);
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_HEADER_MISSING",
  );
  assert.equal(hits.length, 1, JSON.stringify(stampFindings(report)));
  assert.equal(hits[0]?.pageIndex, 4);
});

test("acceptance 2: header text tamper (≠ short_title) is detected", () => {
  const fault = mutateStamp(P4_HEADER_RO, (run) => {
    run.text = "被篡改的页眉";
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_HEADER_INCONSISTENT" && finding.pageIndex === 4,
  );
  assert.equal(hits.length, 1, JSON.stringify(stampFindings(report)));
  assert.equal(hits[0]?.nodeRef, `run:${P4_HEADER_RO}`);
  assert.equal(hits[0]?.basis.metrics["textMatch"], 0);
});

test("acceptance 2: footer moved out of the margin band is detected", () => {
  // 页脚基线从下边距带（25.2）抬进版心（400）→ 位置一致性破坏。
  const fault = mutateStamp(P4_FOOTER_RO, (run) => {
    run.baselineY = 400;
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_FOOTER_INCONSISTENT" && finding.pageIndex === 4,
  );
  assert.equal(hits.length, 1, JSON.stringify(stampFindings(report)));
  assert.equal(hits[0]?.basis.metrics["baselineY"], 400);
});

test("acceptance 2: stamp on cover page is detected (cover exemption violated)", () => {
  const fault = derive((draft) => {
    const source = draft.textRuns.find((run) => run.readingOrder === P4_FOOTER_RO);
    assert.ok(source !== undefined);
    draft.textRuns.push({ ...source, pageIndex: 0, readingOrder: 99999 });
  });
  const report = runP1Checks(inputFor(fault));
  const hits = report.findings.filter(
    (finding) => finding.code === "P1_STAMP_ON_COVER",
  );
  assert.equal(hits.length, 1, JSON.stringify(stampFindings(report)));
  assert.equal(hits[0]?.pageIndex, 0);
});

test("stamp identity: font tag prefix is the single-source criterion (no geometry heuristic)", () => {
  // 把页脚 run 的 font.tag 改成非压印前缀 → 单源口径不再认它是压印
  // → 该页如实报缺页脚（识别依据只看解析期 tag，不用位置/文本猜）。
  const fault = mutateStamp(P4_FOOTER_RO, (run) => {
    run.font = { ...run.font, tag: "F7" };
  });
  const report = runP1Checks(inputFor(fault));
  assert.ok(
    report.findings.some(
      (finding) => finding.code === "P1_FOOTER_MISSING" && finding.pageIndex === 4,
    ),
    JSON.stringify(stampFindings(report)),
  );
});

test("honest gate: missing headerText input degrades text reconcile to one manual, presence still automatic", () => {
  const input = inputFor(baselineEvidence);
  const report = runP1Checks({ ...input, headerText: undefined });
  assert.deepEqual(stampFindings(report), []);
  const reviews = report.manualChecks.filter(
    (manual) => manual.code === "P1_STAMP_REVIEW",
  );
  assert.equal(reviews.length, 1, JSON.stringify(report.manualChecks));
  assert.equal(reviews[0]?.basis.metrics["stampedPages"], 20);
  // 存在性判定不受诚实门影响：缺页眉 fault 仍自动检出。
  const fault = derive((draft) => {
    draft.textRuns = draft.textRuns.filter((run) => run.readingOrder !== P4_HEADER_RO);
  });
  const faultReport = runP1Checks({ ...inputFor(fault), headerText: undefined });
  assert.ok(
    faultReport.findings.some(
      (finding) => finding.code === "P1_HEADER_MISSING" && finding.pageIndex === 4,
    ),
  );
});

test("acceptance 5: per-rule rollback isolates stamp rule; *_REVIEW never in findings", () => {
  const fault = mutateStamp(P4_FOOTER_RO, (run) => {
    run.text = "9 / 21";
  });
  const full = runP1Checks(inputFor(fault));
  assert.ok(
    full.findings.some((finding) => finding.code === "P1_FOOTER_PAGE_MISMATCH"),
  );
  const rolledBack = runP1Checks(inputFor(fault), {
    disabledRules: ["p1-stamp-consistency"],
  });
  assert.ok(
    rolledBack.findings.every((finding) => finding.ruleId !== "p1-stamp-consistency"),
  );
  assert.ok(!rolledBack.rules.includes("p1-stamp-consistency"));
  // 诚实门通道不串：任何 *_REVIEW 码绝不入 findings。
  for (const report of [full, rolledBack]) {
    assert.ok(report.findings.every((finding) => !finding.code.endsWith("_REVIEW")));
  }
});

test("domain split: stamp faults never trigger content-domain findings (no double judgement)", () => {
  // 压印移入版心只属于压印位置判定域；内容域（P0 越界/遮挡、P1 内容）
  // 早已排除压印 run（stamp-scope 同一识别依据），不得重判。
  const fault = mutateStamp(P4_FOOTER_RO, (run) => {
    run.baselineY = 400;
  });
  const report = runP1Checks(inputFor(fault));
  const foreign = report.findings.filter(
    (finding) =>
      finding.ruleId !== "p1-stamp-consistency" &&
      finding.nodeRef === `run:${P4_FOOTER_RO}`,
  );
  assert.deepEqual(foreign, []);
});
