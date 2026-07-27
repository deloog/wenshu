/**
 * p1-figure-fidelity（PA-10）：图内容忠实——图成员 run（SVG 矢量文本/
 * 图例，figureMcid 解析期成员事实）归一拼接须逐字对账该图自己的源
 * SVG 文本（PA-05 normalizePdfText 口径，expected figure-svg 块携带）；
 * 成员 run 字体未嵌入即缺陷（确定性可读性面：嵌入是证据字段事实）。
 * 转换红线：受控 SVG→等价资源转换若改变内容（光栅化丢矢量文本、图例
 * 与源不一致、平台间换图），成员文本必然不等于源 →
 * P1_FIGURE_CONTENT_MISMATCH 必然触发，无法静默通过；基线直渲 SVG
 * 无转换，停止条件如实不触发（ADR-0009 钉定）。
 * 与 p0-content 分域（书面）：p0-content 是全局有序存在性（块路径
 * 定位）；本规则是逐图绑定对账（figure 定位）——p0 无法识别「文本全局
 * 仍在但绑错了图」。单点篡改两面同报属如实并存，不静默其一。
 * 严重级证成（书面）：内容/字体缺陷不阻断渲染（PA-07 P0 域只负几何
 * 与整体存在性），属图文质量 → P1。
 */
import { figureRef, makeFinding } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import { analyzeFigures } from "../p1-figures.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  for (const analysis of analyzeFigures(input)) {
    const ref = figureRef(analysis.figure.pageIndex, analysis.figure.mcid);
    if (analysis.svgText !== null && analysis.memberText !== analysis.svgText) {
      findings.push(
        makeFinding(
          "p1-figure-fidelity",
          "P1_FIGURE_CONTENT_MISMATCH",
          analysis.figure.pageIndex,
          ref,
          {
            expectedLength: analysis.svgText.length,
            actualLength: analysis.memberText.length,
            memberRunCount: analysis.memberRuns.length,
          },
        ),
      );
    }
    const notEmbedded = analysis.memberRuns.filter((run) => !run.font.embedded).length;
    if (notEmbedded > 0) {
      findings.push(
        makeFinding(
          "p1-figure-fidelity",
          "P1_FIGURE_FONT_NOT_EMBEDDED",
          analysis.figure.pageIndex,
          ref,
          {
            memberRunCount: analysis.memberRuns.length,
            notEmbeddedCount: notEmbedded,
          },
        ),
      );
    }
  }
  return { findings, manualChecks };
}

export const p1FigureFidelityRule: P1Rule = Object.freeze({
  id: "p1-figure-fidelity",
  check,
});
