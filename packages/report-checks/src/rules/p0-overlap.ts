/**
 * P0_OVERLAP：文本/图形框相互重叠遮挡。y 向上空间：bbox.y 为顶边。
 *
 * 豁免口径（PA-06 形态事实，书面化）：figure bbox 为版心全域（SVG 根背景），
 * 图表标签/题注等文本 run 完全落在 figure 内——完全包含于某 figure 的 run
 * 视为该图自有内容，不参与遮挡判定；部分重叠（骑缝）仍是 P0。
 *
 * 阈值（书面化）：交集面积 > max(0.5pt², 较小框面积的 1%)。
 * 同行豁免（书面化）：同 MCID 块且基线差 ≤2pt 的 run 是 Td 链上的顺序文本，
 * 其 advance 框重叠来自字距压缩（标点挤压 ≤0.5em）与 advance 高估，非遮挡；
 * 同行重叠宽 > 0.6em（较小字号）仍判 P0。跨行/跨块/图文任何显著交集即 P0。
 */
import type { P0CheckInput, P0Rule } from "../check-input.ts";
import { figureRef, makeFinding, runRef } from "../finding.ts";
import type { Finding } from "../generated/check-report.ts";

const CONTAINMENT_TOLERANCE_PT = 0.5;
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

function contains(outer: OverlapBox, inner: OverlapBox): boolean {
  return (
    inner.left >= outer.left - CONTAINMENT_TOLERANCE_PT &&
    inner.right <= outer.right + CONTAINMENT_TOLERANCE_PT &&
    inner.top <= outer.top + CONTAINMENT_TOLERANCE_PT &&
    inner.bottom >= outer.bottom - CONTAINMENT_TOLERANCE_PT
  );
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

function check(input: P0CheckInput): readonly Finding[] {
  const findings: Finding[] = [];
  for (const page of input.evidence.pages) {
    const figures: OverlapBox[] = input.evidence.figures
      .filter((figure) => figure.pageIndex === page.index)
      .map((figure) => ({
        nodeRef: figureRef(figure.pageIndex, figure.mcid),
        left: figure.bbox.x,
        right: figure.bbox.x + figure.bbox.width,
        top: figure.bbox.y,
        bottom: figure.bbox.y - figure.bbox.height,
        baselineY: Number.NaN,
        blockOrder: -1,
        fontSize: Number.POSITIVE_INFINITY,
      }));
    const contained = (run: OverlapBox): boolean =>
      figures.some((figure) => contains(figure, run));
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
      }))
      .filter((run) => !contained(run));

    const report = (a: OverlapBox, b: OverlapBox): void => {
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
