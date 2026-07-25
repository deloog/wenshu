/**
 * P0_OUT_OF_BOUNDS：文本/图形框出页边或出版心。y 向上空间：bbox.y 为顶边，
 * 底边 = y − height。容差 0.5pt（书面化：吸收 Skia 页框取整抖动与字体
 * FontBBox 高估，远低于 fault 注入量，见实施记录）。
 */
import type { P0CheckInput, P0Rule } from "../check-input.ts";
import { figureRef, makeFinding, runRef } from "../finding.ts";
import type { Finding } from "../generated/check-report.ts";
import type { ContentBox } from "../layout.ts";

const BOUNDS_TOLERANCE_PT = 0.5;

interface BoxEdges {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface LocatedBox {
  readonly pageIndex: number;
  readonly nodeRef: string;
  readonly edges: BoxEdges;
}

function overflow(
  edges: BoxEdges,
  limits: BoxEdges,
): {
  readonly max: number;
  readonly directional: Record<string, number>;
} {
  const directional: Record<string, number> = {};
  const candidates: readonly (readonly [string, number])[] = [
    ["leftPt", limits.left - edges.left],
    ["rightPt", edges.right - limits.right],
    ["topPt", edges.top - limits.top],
    ["bottomPt", limits.bottom - edges.bottom],
  ];
  let max = 0;
  for (const [key, amount] of candidates) {
    if (amount > BOUNDS_TOLERANCE_PT) {
      directional[key] = amount;
      max = Math.max(max, amount);
    }
  }
  return { max, directional };
}

function checkBox(box: LocatedBox, input: P0CheckInput): Finding | null {
  const page = input.evidence.pages[box.pageIndex];
  if (page === undefined) {
    return null;
  }
  const pageLimits: BoxEdges = {
    left: 0,
    right: page.widthPt,
    top: page.heightPt,
    bottom: 0,
  };
  const content: ContentBox = input.contentBox;
  const beyondPage = overflow(box.edges, pageLimits);
  const beyondContent = overflow(box.edges, content);
  if (beyondPage.max === 0 && beyondContent.max === 0) {
    return null;
  }
  return makeFinding("p0-bounds", "P0_OUT_OF_BOUNDS", box.pageIndex, box.nodeRef, {
    beyondPagePt: beyondPage.max,
    beyondContentBoxPt: beyondContent.max,
    ...beyondPage.directional,
    ...beyondContent.directional,
  });
}

function check(input: P0CheckInput): readonly Finding[] {
  const findings: Finding[] = [];
  for (const run of input.evidence.textRuns) {
    const finding = checkBox(
      {
        pageIndex: run.pageIndex,
        nodeRef: runRef(run.readingOrder),
        edges: {
          left: run.bbox.x,
          right: run.bbox.x + run.bbox.width,
          top: run.bbox.y,
          bottom: run.bbox.y - run.bbox.height,
        },
      },
      input,
    );
    if (finding !== null) {
      findings.push(finding);
    }
  }
  for (const figure of input.evidence.figures) {
    const finding = checkBox(
      {
        pageIndex: figure.pageIndex,
        nodeRef: figureRef(figure.pageIndex, figure.mcid),
        edges: {
          left: figure.bbox.x,
          right: figure.bbox.x + figure.bbox.width,
          top: figure.bbox.y,
          bottom: figure.bbox.y - figure.bbox.height,
        },
      },
      input,
    );
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return findings;
}

export const p0BoundsRule: P0Rule = Object.freeze({
  id: "p0-bounds",
  check,
});
