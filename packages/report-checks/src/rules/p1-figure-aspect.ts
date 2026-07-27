/**
 * p1-figure-aspect（PA-10）：图绘制宽高比须等于源 SVG 固有比（viewBox），
 * 失真判缺陷。绘制范围取 paintBBox（ADR-0006：bbox 含 clip 不绘制，
 * 语义可见范围只有 paintBBox）；源侧事实取 expected figure-svg 块携带的
 * viewBox 固有比（声明式，禁几何启发式）。容差为书面化模块常量
 * （ADR-0009：Chromium/Skia 等比缩放是精确仿射，不失真时比值数学相等，
 * 容差只吸收 paintBBox 构造的 pt 取整噪声）；源侧无合法 viewBox 时
 * fail-closed 降 P1_FIGURE_ASPECT_REVIEW 人工核验（不猜）。
 * 严重级证成（书面）：比例失真不缺字、不越界、不遮挡（PA-07 域），
 * 是图文呈现质量缺陷 → P1。
 */
import { figureRef, makeFinding, makeManualCheck } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import { analyzeFigures } from "../p1-figures.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

/**
 * 宽高比绝对容差（ADR-0009 书面化）：基线实测偏差 <0.0001，余量两个
 * 数量级；只吸收 pt 取整噪声，不用于放行任何可见失真。
 */
export const FIGURE_ASPECT_TOLERANCE = 0.01;

export const FIGURE_ASPECT_REVIEW_REASON =
  "源 SVG 无合法 viewBox 固有比，比例判定无确定性依据，fail-closed 降人工核验。";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  for (const analysis of analyzeFigures(input)) {
    const ref = figureRef(analysis.figure.pageIndex, analysis.figure.mcid);
    if (analysis.aspectRatio === null) {
      manualChecks.push(
        makeManualCheck(
          "p1-figure-aspect",
          "P1_FIGURE_ASPECT_REVIEW",
          analysis.figure.pageIndex,
          ref,
          FIGURE_ASPECT_REVIEW_REASON,
          { sourceAspectDeclared: 0 },
        ),
      );
      continue;
    }
    const paintAspect =
      analysis.figure.paintBBox.width / analysis.figure.paintBBox.height;
    const deviation = Math.abs(paintAspect - analysis.aspectRatio);
    if (deviation > FIGURE_ASPECT_TOLERANCE) {
      findings.push(
        makeFinding(
          "p1-figure-aspect",
          "P1_FIGURE_ASPECT_DISTORTED",
          analysis.figure.pageIndex,
          ref,
          {
            paintAspectMilli: Math.round(paintAspect * 1000),
            sourceAspectMilli: Math.round(analysis.aspectRatio * 1000),
            deviationMilli: Math.round(deviation * 1000),
            toleranceMilli: Math.round(FIGURE_ASPECT_TOLERANCE * 1000),
          },
        ),
      );
    }
  }
  return { findings, manualChecks };
}

export const p1FigureAspectRule: P1Rule = Object.freeze({
  id: "p1-figure-aspect",
  check,
});
