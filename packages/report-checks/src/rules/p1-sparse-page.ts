/**
 * p1-sparse-page（PA-08）：异常空白/稀疏页的密度证据。
 *
 * 自动判定仅限二值事实：整页零文本 run 且零 figure（当前模板没有任何
 * 会产生空白页的构造）→ P1_EMPTY_PAGE。这是确定性极端，不是启发式
 * 阈值。
 *
 * 人工核验（诚实门，本规则的命门）：「稀疏」在冻结模板中没有密度
 * 阈值定义——max_consecutive_sparse_pages 只约束连续稀疏页数，不定义
 * 何谓稀疏。任何密度阈值都是无溯源的自定义值，因此本规则绝不自动
 * 判定稀疏：对每一页产出 P1_SPARSE_DENSITY_REVIEW 人工核验项，附
 * 文本/图形面积与版心占比等数值证据，由人工对照模板值裁定。
 */
import { makeFinding, makeManualCheck, pageRef } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

const SPARSE_REVIEW_REASON =
  "冻结模板只定义 max_consecutive_sparse_pages（连续稀疏页数），未定义稀疏密度阈值；" +
  "任何密度阈值均无模板溯源，故不作自动判定，附逐页密度证据降人工对照裁定。";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const { contentBox, evidence, paginationRules } = input;
  const boxArea =
    (contentBox.right - contentBox.left) * (contentBox.top - contentBox.bottom);
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  for (const page of evidence.pages) {
    const runs = evidence.textRuns.filter((run) => run.pageIndex === page.index);
    const figures = evidence.figures.filter(
      (figure) => figure.pageIndex === page.index,
    );
    const textArea = runs.reduce(
      (sum, run) => sum + run.bbox.width * run.bbox.height,
      0,
    );
    const figureArea = figures.reduce(
      (sum, figure) => sum + figure.paintBBox.width * figure.paintBBox.height,
      0,
    );
    if (runs.length === 0 && figures.length === 0) {
      findings.push(
        makeFinding(
          "p1-sparse-page",
          "P1_EMPTY_PAGE",
          page.index,
          pageRef(page.index),
          {
            textRunCount: 0,
            figureCount: 0,
          },
        ),
      );
    }
    manualChecks.push(
      makeManualCheck(
        "p1-sparse-page",
        "P1_SPARSE_DENSITY_REVIEW",
        page.index,
        pageRef(page.index),
        SPARSE_REVIEW_REASON,
        {
          textAreaPt2: textArea,
          figureAreaPt2: figureArea,
          coverageRatio: boxArea > 0 ? (textArea + figureArea) / boxArea : 0,
          templateMaxConsecutiveSparsePages:
            paginationRules.max_consecutive_sparse_pages,
        },
      ),
    );
  }
  return { findings, manualChecks };
}

export const p1SparsePageRule: P1Rule = Object.freeze({
  id: "p1-sparse-page",
  check,
});
