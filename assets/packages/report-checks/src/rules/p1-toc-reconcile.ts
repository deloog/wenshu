/**
 * p1-toc-reconcile（PA-11B）：目录↔标题双向对账。
 * - 缺项：应入目录的条目未渲染（toc-entry 期望块未归属）→
 *   P1_TOC_ENTRY_MISSING，定位到条目 ref 与配对标题 ref（同条目
 *   marker 随 <ol> 渲染同生共灭，不重复计报）。
 * - 多项：目录区域内未被期望块覆盖的非数字文本行 →
 *   P1_TOC_ENTRY_EXTRA，定位到行首 run。
 * - 目录栏目标题未归属 → 全域不可定位，fail-closed 降
 *   P1_TOC_RECONCILE_REVIEW 人工（不猜不藏）。
 * 分域（ADR-0011 §3）：本规则判结构对应，不判目录文本字级正确性
 * （p0-content 域）。
 */
import { makeFinding, makeManualCheck, runRef } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";
import { analyzeToc, groupExtraRunsByLine } from "../p1-toc.ts";

const REVIEW_REASON =
  "toc-heading 未归属，目录域不可定位：条目对应关系全部降人工核验（fail-closed，不猜测目录位置）";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  const analysis = analyzeToc(input);

  // 无目录文档：全域静默（目录域不存在，非缺陷也非人工项）。
  if (!analysis.tocDomainPresent) {
    return { findings, manualChecks };
  }
  if (!analysis.tocHeadingMatched) {
    manualChecks.push(
      makeManualCheck(
        "p1-toc-reconcile",
        "P1_TOC_RECONCILE_REVIEW",
        0,
        "/toc",
        REVIEW_REASON,
        { entriesExpected: analysis.entriesExpected },
      ),
    );
    return { findings, manualChecks };
  }
  const tocPage = analysis.tocPage ?? 0;

  for (const entry of analysis.entries) {
    if (!entry.entryMatched) {
      findings.push(
        makeFinding(
          "p1-toc-reconcile",
          "P1_TOC_ENTRY_MISSING",
          tocPage,
          entry.entryRef,
          { tocIndex: entry.tocIndex },
          entry.headingRef ?? undefined,
        ),
      );
    }
  }

  // 多项：区域内未覆盖非数字 run，按视觉行归并（每行一条发现）。
  for (const line of groupExtraRunsByLine(analysis.extraRuns)) {
    const first = line[0];
    if (first === undefined) {
      continue;
    }
    findings.push(
      makeFinding(
        "p1-toc-reconcile",
        "P1_TOC_ENTRY_EXTRA",
        first.pageIndex,
        runRef(first.readingOrder),
        { runsInLine: line.length },
      ),
    );
  }

  return { findings, manualChecks };
}

export const p1TocReconcileRule: P1Rule = Object.freeze({
  id: "p1-toc-reconcile",
  check,
});
