/**
 * p1-figure-caption（PA-10）：图与题注同页——模板
 * figure_keep_with_caption:true 声明题注不得被孤立到次页。归属经
 * p1-figures 三重防线；歧义/异版式 fail-closed 只报
 * P1_FIGURE_CAPTION_REVIEW 人工核验（不猜）。题注整体缺席由
 * P0_CONTENT_MISSING（PA-07 域）判定，本规则不重判。
 * 严重级证成（书面）：题注孤立到次页不缺字（P0-content 域）、不越界
 * 不遮挡（PA-07 几何域），违反的是模板声明式图文同页规则，与
 * PA-08/09 分页质量同属 → P1。模板门 false 时整条规则静默跳过
 * （镜像 table_repeat_header 先例）。
 */
import { figureRef, makeFinding, makeManualCheck, runRef } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import { analyzeFigures } from "../p1-figures.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

export const FIGURE_CAPTION_REVIEW_REASON =
  "题注到 run 归属存在歧义或异版式（对齐/阅读序/几何校验未过），fail-closed 不作自动判定，降人工核验。";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  if (!input.paginationRules.figure_keep_with_caption) {
    return { findings, manualChecks };
  }
  for (const analysis of analyzeFigures(input)) {
    const ref = figureRef(analysis.figure.pageIndex, analysis.figure.mcid);
    const span = analysis.caption.span;
    if (analysis.caption.status === "wrong-page" && span !== null) {
      findings.push(
        makeFinding(
          "p1-figure-caption",
          "P1_FIGURE_CAPTION_SEPARATED",
          span.pageIndex,
          ref,
          {
            figurePage: analysis.figure.pageIndex,
            captionPage: span.pageIndex,
            templateFigureKeepWithCaption: 1,
          },
          runRef(span.firstReadingOrder),
        ),
      );
      continue;
    }
    if (analysis.caption.status !== "ok") {
      manualChecks.push(
        makeManualCheck(
          "p1-figure-caption",
          "P1_FIGURE_CAPTION_REVIEW",
          analysis.figure.pageIndex,
          ref,
          FIGURE_CAPTION_REVIEW_REASON,
          { attributionAmbiguity: analysis.caption.ambiguity },
        ),
      );
    }
  }
  return { findings, manualChecks };
}

export const p1FigureCaptionRule: P1Rule = Object.freeze({
  id: "p1-figure-caption",
  check,
});
