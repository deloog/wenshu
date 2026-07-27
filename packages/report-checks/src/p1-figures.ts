/**
 * 图片域归属分析（PA-10 命门）：把证据 figures[] 与文档侧 figure 三块
 * （figure-svg/figure-caption/figure-source，figureOrdinal 绑定）对齐，
 * 并给每张图归属题注 run 段与来源 run 段。三重防线（全部确定性事实，
 * 任一不过即歧义 fail-closed，由规则降人工，绝不猜）：
 *   1. 文本对齐：归一整串匹配 + run 边界对齐 + 阅读序连续 + 单一 MCID 块
 *      （p1-figure-locate）；
 *   2. 阅读序：题注候选必须出现在图成员 run 之后（figcaption 在 /Figure
 *      之后），来源候选必须在题注之后；取首个候选，多候选即歧义；
 *   3. 几何一致性：同页题注必须在图绘制范围之下（topY ≤ paint 底边 +
 *      容差），违反即歧义（题注在图上方属异版式，不自动判）。
 * 分域红线：本模块不做任何出页/出版心/遮挡判定（PA-07 P0 域）；「越界」
 * 语义仅指题注/来源越页孤立（页归属），与几何域正交。
 */
import type { FigureBox, TextRun } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";

import type { ExpectedBlock } from "./expected-content.ts";
import { locateText, type RunSpan } from "./p1-figure-locate.ts";
import type { P1CheckInput } from "./p1-input.ts";

/** 题注顶边允许高出 paint 底边的容差（pt）：只吸收取整噪声，书面化于 ADR-0009。 */
export const CAPTION_BELOW_TOLERANCE_PT = 1;

export type AttributionStatus =
  "ok" | "wrong-page" | "wrong-order" | "ambiguous" | "absent";

export interface Attribution {
  readonly status: AttributionStatus;
  readonly span: RunSpan | null;
  /** 歧义证据计数（多候选或对齐校验未过次数），仅作 metrics。 */
  readonly ambiguity: number;
}

export interface FigureAnalysis {
  readonly figure: FigureBox;
  /** 与文档侧 figureOrdinal 对齐的图序号（证据 figures 按页/mcid 升序）。 */
  readonly ordinal: number;
  /** 图成员 run（figureMcid 成员事实，阅读序升序）。 */
  readonly memberRuns: readonly TextRun[];
  /** 成员 run 归一拼接文本（PA-05 口径，对账源 SVG 用）。 */
  readonly memberText: string;
  readonly svgText: string | null;
  readonly aspectRatio: number | null;
  readonly captionText: string | null;
  readonly sourceText: string | null;
  readonly caption: Attribution;
  readonly source: Attribution;
  /** 来源首 ro - 题注末 ro - 1（两者均 ok 时）；0 = 紧随。 */
  readonly sourceGapAfterCaption: number | null;
}

function attribute(
  evidence: P1CheckInput["evidence"],
  target: string | null,
  afterReadingOrder: number,
  expectedPage: number,
  geometry?: { paintBottomY: number },
): Attribution {
  if (target === null) {
    return Object.freeze({ status: "absent", span: null, ambiguity: 0 });
  }
  const located = locateText(evidence, target);
  const candidates = located.spans.filter(
    (span) => span.firstReadingOrder > afterReadingOrder,
  );
  const ambiguity = located.ambiguousOccurrences;
  if (candidates.length === 0) {
    return Object.freeze({
      status: located.spans.length > 0 ? "wrong-order" : "absent",
      span: null,
      ambiguity: ambiguity + located.spans.length,
    });
  }
  if (candidates.length > 1) {
    return Object.freeze({
      status: "ambiguous",
      span: null,
      ambiguity: ambiguity + candidates.length,
    });
  }
  const span = candidates[0];
  if (span === undefined) {
    return Object.freeze({ status: "ambiguous", span: null, ambiguity: 1 });
  }
  if (
    geometry !== undefined &&
    span.pageIndex === expectedPage &&
    span.topY > geometry.paintBottomY + CAPTION_BELOW_TOLERANCE_PT
  ) {
    // 同页候选却在图绘制范围之上：异版式，不自动判。
    return Object.freeze({ status: "ambiguous", span: null, ambiguity: 1 });
  }
  if (span.pageIndex !== expectedPage) {
    // 存在但越页孤立（页归属事实，非几何越界——几何越界是 PA-07 P0 域）。
    return Object.freeze({ status: "wrong-page", span, ambiguity });
  }
  return Object.freeze({
    status: "ok",
    span,
    ambiguity,
  });
}

export function analyzeFigures(input: P1CheckInput): readonly FigureAnalysis[] {
  const { evidence, expected } = input;
  const figures = [...evidence.figures].sort(
    (a, b) => a.pageIndex - b.pageIndex || a.mcid - b.mcid,
  );
  const docByOrdinal = new Map<
    number,
    { svg?: ExpectedBlock; caption?: ExpectedBlock; source?: ExpectedBlock }
  >();
  for (const block of expected) {
    if (block.figureOrdinal === undefined) {
      continue;
    }
    const entry = docByOrdinal.get(block.figureOrdinal) ?? {};
    if (block.kind === "figure-svg") {
      entry.svg = block;
    } else if (block.kind === "figure-caption") {
      entry.caption = block;
    } else if (block.kind === "figure-source") {
      entry.source = block;
    }
    docByOrdinal.set(block.figureOrdinal, entry);
  }

  return figures.map((figure, ordinal) => {
    const memberRuns = evidence.textRuns
      .filter(
        (run) => run.figureMcid === figure.mcid && run.pageIndex === figure.pageIndex,
      )
      .sort((a, b) => a.readingOrder - b.readingOrder);
    const memberText = normalizePdfText(memberRuns.map((run) => run.text).join(""));
    const doc = docByOrdinal.get(ordinal);
    const lastMemberRo = memberRuns[memberRuns.length - 1]?.readingOrder ?? -1;
    const paintBottomY = figure.paintBBox.y - figure.paintBBox.height;

    const caption = attribute(
      evidence,
      doc?.caption?.text ?? null,
      lastMemberRo,
      figure.pageIndex,
      { paintBottomY },
    );
    const captionEnd =
      (caption.status === "ok" || caption.status === "wrong-page") &&
      caption.span !== null
        ? caption.span.lastReadingOrder
        : lastMemberRo;
    const source = attribute(
      evidence,
      doc?.source?.text ?? null,
      captionEnd,
      figure.pageIndex,
    );
    const sourceGapAfterCaption =
      caption.status === "ok" &&
      caption.span !== null &&
      source.status === "ok" &&
      source.span !== null
        ? source.span.firstReadingOrder - caption.span.lastReadingOrder - 1
        : null;

    return Object.freeze({
      figure,
      ordinal,
      memberRuns: Object.freeze(memberRuns),
      memberText,
      svgText: doc?.svg?.text ?? null,
      aspectRatio: doc?.svg?.figureAspect ?? null,
      captionText: doc?.caption?.text ?? null,
      sourceText: doc?.source?.text ?? null,
      caption,
      source,
      sourceGapAfterCaption,
    });
  });
}
