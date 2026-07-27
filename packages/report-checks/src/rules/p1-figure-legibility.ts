/**
 * p1-figure-legibility（PA-10 诚实门）：图的视觉清晰/可读性无确定性
 * 判据（无模板阈值、无源可测依据），自动判定只覆盖确定性面——矢量
 * 文本存在与字体嵌入已由 p1-figure-fidelity 对账；其余（缩放后是否
 * 清晰可读）逐图显式降 P1_FIGURE_LEGIBILITY_REVIEW 人工核验，附
 * paintBBox 尺寸/成员 run 数/最小成员字号作证据，绝不伪装自动覆盖、
 * 绝不发明阈值（承接 PA-08 诚实门）。本规则只产 manualChecks，
 * 绝不产 findings。
 */
import { figureRef, makeManualCheck } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import { analyzeFigures } from "../p1-figures.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

export const FIGURE_LEGIBILITY_REVIEW_REASON =
  "图的视觉清晰度无确定性/无源可测判据（模板未定义密度或清晰度阈值），自动面仅覆盖矢量文本与字体嵌入（fidelity 规则），其余降人工核验。";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  for (const analysis of analyzeFigures(input)) {
    manualChecks.push(
      makeManualCheck(
        "p1-figure-legibility",
        "P1_FIGURE_LEGIBILITY_REVIEW",
        analysis.figure.pageIndex,
        figureRef(analysis.figure.pageIndex, analysis.figure.mcid),
        FIGURE_LEGIBILITY_REVIEW_REASON,
        {
          paintWidthPt: Math.round(analysis.figure.paintBBox.width * 100) / 100,
          paintHeightPt: Math.round(analysis.figure.paintBBox.height * 100) / 100,
          memberRunCount: analysis.memberRuns.length,
          minMemberFontSizePt:
            analysis.memberRuns.length === 0
              ? 0
              : Math.min(...analysis.memberRuns.map((run) => run.fontSize)),
        },
      ),
    );
  }
  return { findings, manualChecks };
}

export const p1FigureLegibilityRule: P1Rule = Object.freeze({
  id: "p1-figure-legibility",
  check,
});
