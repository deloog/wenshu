/**
 * P0_OVERLAP：文本/图形绘制内容相互重叠遮挡。y 向上空间：bbox.y 为顶边。
 *
 * 豁免口径（PA-06B / 决策 #10，成员制）：只豁免 figure 自有内容——run 的
 * figureMcid（解析期结构事实，禁几何推断）与 figure 的 MCID 相同的配对不
 * 参与遮挡判定（图表标签 vs 自己的图、同一图的标签互叠）。几何落入 figure
 * 但非成员的 run 一律参与判定：与 figure 绘制框（paintBBox，clip 不绘制、
 * 自家管线 SVG 根背景只撑 bbox 不撑 paintBBox）任何显著重叠（含完全包含、
 * 不骑缝）即 P0。基线形态事实：figure 页正文 run 全部非成员且与 paintBBox
 * 零显著重叠（pdf-evidence 基线集成测试钉定），故误报不回潮。
 *
 * 阈值（书面化）：交集面积 > max(0.5pt², 较小框面积的 1%)。
 * 同行豁免（书面化）：同 MCID 块且基线差 ≤2pt 的 run 是 Td 链上的顺序文本，
 * 其 advance 框重叠来自字距压缩（标点挤压 ≤0.5em）与 advance 高估，非遮挡；
 * 同行重叠宽 > 0.6em（较小字号）仍判 P0。跨行/跨块/图文任何显著交集即 P0。
 */
import type { P0CheckInput, P0Rule } from "../check-input.ts";
import { figureRef, makeFinding, runRef } from "../finding.ts";
import type { Finding } from "../generated/check-report.ts";

const MIN_OVERLAP_AREA_PT2 = 0.5;
const MIN_OVERLAP_RATIO = 0.01;
const SAME_LINE_BASELINE_PT = 2;
const KERNING_ALLOWANCE_EM = 0.6;

interface OverlapBox {
  readonly nodeRef: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly baselineY: number;
  readonly blockOrder: number;
  readonly fontSize: number;
  /** 成员归属：run 取 figureMcid（结构事实），figure 取自身 MCID。 */
  readonly memberOf: number | null;
}

function area(box: OverlapBox): number {
  return (box.right - box.left) * (box.top - box.bottom);
}

function intersection(
  a: OverlapBox,
  b: OverlapBox,
): {
  readonly width: number;
  readonly height: number;
  readonly area: number;
} {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0, area: 0 };
  }
  return { width, height, area: width * height };
}

function significant(
  hit: { readonly area: number },
  a: OverlapBox,
  b: OverlapBox,
): boolean {
  return (
    hit.area > MIN_OVERLAP_AREA_PT2 &&
    hit.area > MIN_OVERLAP_RATIO * Math.min(area(a), area(b))
  );
}

/** 同块同视觉行（基线差 ≤2pt）的顺序文本：advance 框重叠按字距压缩豁免。 */
function sameVisualLine(a: OverlapBox, b: OverlapBox): boolean {
  return (
    a.blockOrder === b.blockOrder &&
    Math.abs(a.baselineY - b.baselineY) <= SAME_LINE_BASELINE_PT
  );
}

/** 成员制豁免：同属一个 figure 的自有内容互叠不参与遮挡判定。 */
function sameFigureContent(a: OverlapBox, b: OverlapBox): boolean {
  return a.memberOf !== null && a.memberOf === b.memberOf;
}

function check(input: P0CheckInput): readonly Finding[] {
  const findings: Finding[] = [];
  for (const page of input.evidence.pages) {
    const figures: OverlapBox[] = input.evidence.figures
      .filter((figure) => figure.pageIndex === page.index)
      .map((figure) => ({
        nodeRef: figureRef(figure.pageIndex, figure.mcid),
        left: figure.paintBBox.x,
        right: figure.paintBBox.x + figure.paintBBox.width,
        top: figure.paintBBox.y,
        bottom: figure.paintBBox.y - figure.paintBBox.height,
        baselineY: Number.NaN,
        blockOrder: -1,
        fontSize: Number.POSITIVE_INFINITY,
        memberOf: figure.mcid,
      }));
    const runs: OverlapBox[] = input.evidence.textRuns
      .filter((run) => run.pageIndex === page.index)
      .map((run) => ({
        nodeRef: runRef(run.readingOrder),
        left: run.bbox.x,
        right: run.bbox.x + run.bbox.width,
        top: run.bbox.y,
        bottom: run.bbox.y - run.bbox.height,
        baselineY: run.baselineY,
        blockOrder: run.blockOrder,
        fontSize: run.fontSize,
        memberOf: run.figureMcid,
      }));

    const report = (a: OverlapBox, b: OverlapBox): void => {
      if (sameFigureContent(a, b)) {
        return;
      }
      const hit = intersection(a, b);
      if (!significant(hit, a, b)) {
        return;
      }
      if (
        sameVisualLine(a, b) &&
        hit.width <= KERNING_ALLOWANCE_EM * Math.min(a.fontSize, b.fontSize)
      ) {
        return;
      }
      findings.push(
        makeFinding(
          "p0-overlap",
          "P0_OVERLAP",
          page.index,
          a.nodeRef,
          {
            overlapAreaPt2: hit.area,
            overlapWidthPt: hit.width,
            overlapHeightPt: hit.height,
          },
          b.nodeRef,
        ),
      );
    };
    for (let outer = 0; outer < runs.length; outer += 1) {
      const a = runs[outer];
      if (a === undefined) {
        continue;
      }
      for (let inner = outer + 1; inner < runs.length; inner += 1) {
        const b = runs[inner];
        if (b !== undefined) {
          report(a, b);
        }
      }
      for (const figure of figures) {
        report(a, figure);
      }
    }
    for (let outer = 0; outer < figures.length; outer += 1) {
      const a = figures[outer];
      if (a === undefined) {
        continue;
      }
      for (let inner = outer + 1; inner < figures.length; inner += 1) {
        const b = figures[inner];
        if (b !== undefined) {
          report(a, b);
        }
      }
    }
  }
  return findings;
}

export const p0OverlapRule: P0Rule = Object.freeze({
  id: "p0-overlap",
  check,
});
