/**
 * p1-figure-source（PA-10）：来源紧随题注且与图同页（golden-report 声明
 * 意图）。文档侧来源块 = figure 紧邻后继、「图N来源：」前缀的 paragraph
 * （expected-content 标 figure-source，声明式事实）；证据侧归属经
 * p1-figures 三重防线。越页孤立、跑到题注之前、未紧随题注（阅读序有
 * 夹块）均为确定性次序/页归属事实 → P1_FIGURE_SOURCE_SEPARATED；归属
 * 歧义 fail-closed 只报 P1_FIGURE_SOURCE_REVIEW（不猜）。来源整体缺席
 * 由 P0_CONTENT_MISSING（PA-07 域）判定，本规则不重判。
 * 严重级证成（书面）：与 p1-figure-caption 同属分页/结构质量 → P1。
 */
import { figureRef, makeFinding, makeManualCheck, runRef } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import { analyzeFigures, type FigureAnalysis } from "../p1-figures.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

export const FIGURE_SOURCE_REVIEW_REASON =
  "来源到 run 归属存在歧义或文档未声明来源块，fail-closed 不作自动判定，降人工核验。";

function separated(
  analysis: FigureAnalysis,
  metrics: Readonly<Record<string, number>>,
  related?: string,
): Finding {
  return makeFinding(
    "p1-figure-source",
    "P1_FIGURE_SOURCE_SEPARATED",
    analysis.figure.pageIndex,
    figureRef(analysis.figure.pageIndex, analysis.figure.mcid),
    metrics,
    related,
  );
}

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  for (const analysis of analyzeFigures(input)) {
    const span = analysis.source.span;
    if (analysis.sourceText === null) {
      // 文档未声明来源块：是否应有来源无法自动判定 → 人工。
      manualChecks.push(
        makeManualCheck(
          "p1-figure-source",
          "P1_FIGURE_SOURCE_REVIEW",
          analysis.figure.pageIndex,
          figureRef(analysis.figure.pageIndex, analysis.figure.mcid),
          FIGURE_SOURCE_REVIEW_REASON,
          { sourceDeclared: 0 },
        ),
      );
      continue;
    }
    if (analysis.source.status === "wrong-page" && span !== null) {
      findings.push(
        separated(
          analysis,
          { figurePage: analysis.figure.pageIndex, sourcePage: span.pageIndex },
          runRef(span.firstReadingOrder),
        ),
      );
      continue;
    }
    if (analysis.source.status === "wrong-order") {
      findings.push(
        separated(analysis, {
          orderViolation: 1,
          figurePage: analysis.figure.pageIndex,
        }),
      );
      continue;
    }
    if (analysis.source.status === "ok" && analysis.sourceGapAfterCaption !== null) {
      if (analysis.caption.status === "ok" && analysis.sourceGapAfterCaption > 0) {
        // 来源与题注之间夹了其他 run：未紧随（阅读序确定性事实）。
        findings.push(
          separated(analysis, {
            gapRunsAfterCaption: analysis.sourceGapAfterCaption,
            figurePage: analysis.figure.pageIndex,
          }),
        );
      }
      continue;
    }
    if (analysis.source.status !== "ok") {
      manualChecks.push(
        makeManualCheck(
          "p1-figure-source",
          "P1_FIGURE_SOURCE_REVIEW",
          analysis.figure.pageIndex,
          figureRef(analysis.figure.pageIndex, analysis.figure.mcid),
          FIGURE_SOURCE_REVIEW_REASON,
          { attributionAmbiguity: analysis.source.ambiguity, sourceDeclared: 1 },
        ),
      );
    }
  }
  return { findings, manualChecks };
}

export const p1FigureSourceRule: P1Rule = Object.freeze({
  id: "p1-figure-source",
  check,
});
