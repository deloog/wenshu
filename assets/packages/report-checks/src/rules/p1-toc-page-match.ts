/**
 * p1-toc-page-match（PA-11B，承接模板验收项 toc_page_numbers_match）：
 * 目录条目标注页码 === 该标题实际印刷页。实际页只从证据读
 * （section-title 归属 run 的 pageIndex + 1，编号语义 ADR-0010）——
 * 本规则揪出标注与实际的漂移，自身绝不用假设页码冒充实际
 * （实际页码红线，PA-11B 开工指令命门）。
 * 任一侧不可判定（标题未归属、标题跨页异常、标注缺失或歧义）
 * → fail-closed 降 P1_TOC_PAGE_REVIEW 人工，不猜不藏；条目缺项
 * 已由 p1-toc-reconcile 定位为发现，此处不重复降人工。
 */
import { makeFinding, makeManualCheck } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";
import { analyzeToc } from "../p1-toc.ts";

const REVIEW_REASON =
  "标题归属或页码标注不可确定（标题未归属/跨页异常/标注歧义）：页码对账降人工核验（fail-closed，不以猜测冒充实际页）";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  const analysis = analyzeToc(input);
  // 无目录文档全域静默；目录域不可定位时由 p1-toc-reconcile 统一降人工，
  // 本规则不重复发声。
  if (!analysis.tocDomainPresent || !analysis.tocHeadingMatched) {
    return { findings, manualChecks };
  }
  const tocPage = analysis.tocPage ?? 0;

  for (const entry of analysis.entries) {
    if (!entry.entryMatched) {
      continue;
    }
    if (!entry.headingMatched || entry.headingPage === null || entry.labelAmbiguous) {
      manualChecks.push(
        makeManualCheck(
          "p1-toc-page-match",
          "P1_TOC_PAGE_REVIEW",
          tocPage,
          entry.entryRef,
          REVIEW_REASON,
          {
            tocIndex: entry.tocIndex,
            headingMatched: entry.headingMatched ? 1 : 0,
            labelAmbiguous: entry.labelAmbiguous ? 1 : 0,
          },
          entry.headingRef ?? undefined,
        ),
      );
      continue;
    }
    const actualPage = entry.headingPage + 1;
    if (entry.label !== actualPage) {
      findings.push(
        makeFinding(
          "p1-toc-page-match",
          "P1_TOC_PAGE_MISMATCH",
          tocPage,
          entry.entryRef,
          { tocIndex: entry.tocIndex, printedPage: entry.label ?? -1, actualPage },
          entry.headingRef ?? undefined,
        ),
      );
    }
  }

  return { findings, manualChecks };
}

export const p1TocPageMatchRule: P1Rule = Object.freeze({
  id: "p1-toc-page-match",
  check,
});
