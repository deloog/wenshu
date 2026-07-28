/**
 * 独立几何 oracle 交叉验证：证据模型（自写解析器） vs pdfjs-dist 独立解析。
 * pdf.js 侧事实提取见 oracle-pdfjs.ts；本文件只做比对与报告。
 *
 * 容差（书面化，实测校准）：
 * - 页框：1pt（PA-05 既定事实 A4 594.96–595.92pt 容差 1pt）。
 * - 行基线 / 行起点 x：0.5pt；行宽（末右-首左）：1pt。
 * - 文本逐行比对先按 PA-05 归一口径（部首→CJK、NFKC、剥离空白）。
 * - figure 框：路径 minMax 经 operator-list save/restore/transform 链换算，
 *   与证据 bbox 双向各边偏差 ≤2pt（y 向上空间，bbox.y 为顶边）。
 *
 * 压印行排除口径（PA-11A）：本 oracle 验证的是引擎产出字节的几何；页眉页脚
 * 压印行是自家追加算子（其正确性由后缀锚定剥离对账/交叠自检/压印单测覆盖），
 * 且 pdf.js 对 Skia Type3 字体的行内位置启发式（isCharBBox 分支）会错位压印
 * 行——两侧在比对前剥离：证据侧按资源 tag（/^PA11F\d+$/，解析期事实）过滤；
 * oracle 侧按内容序尾部锚定剥离并逐串验证（页脚拼接/页眉单现不等即
 * stamp-tail 失配，fail-closed）。
 *
 * 用法：node scripts/oracle-crosscheck.ts <pdf 路径>。
 * 退出码：0 = 全部一致；1 = 存在超容差分歧或证据提取失败。
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { normalizePdfText } from "@wenshu/pdf-export";

import { extractEvidence } from "../src/extract-evidence.ts";
import type { WenshuPdfEvidence } from "../src/generated/evidence.ts";
import {
  bucketRuns,
  extractOracle,
  type OracleLine,
  type StampStripExpectation,
} from "./oracle-pdfjs.ts";

const PAGE_BOX_TOLERANCE_PT = 1;
const LINE_BASELINE_TOLERANCE_PT = 0.5;
const LINE_X_TOLERANCE_PT = 0.5;
const LINE_WIDTH_TOLERANCE_PT = 1;
const FIGURE_EDGE_TOLERANCE_PT = 2;

interface Mismatch {
  readonly kind: string;
  readonly pageIndex: number;
  readonly detail: string;
}

export interface CrosscheckReport {
  readonly ok: boolean;
  readonly pagesChecked: number;
  readonly linesChecked: number;
  readonly figuresChecked: number;
  readonly mismatches: readonly Mismatch[];
  /**
   * ActualText 分歧（信息项，非不一致）：pdf.js 不支持 ActualText，span 内回退
   * ToUnicode 解码得部首形/figure dash，本方取 ActualText 本文——差异本身证实
   * ActualText 是唯一语义面（PA-05 既定事实）。这些行的几何仍逐条交叉验证。
   */
  readonly actualTextDivergences: readonly Mismatch[];
}

function evidenceLines(evidence: WenshuPdfEvidence, pageIndex: number): OracleLine[] {
  return bucketRuns(
    evidence.textRuns
      .filter((run) => run.pageIndex === pageIndex && !/^PA11F\d+$/u.test(run.font.tag))
      .map((run) => ({
        x: run.bbox.x,
        baselineY: run.baselineY,
        maxX: run.bbox.x + run.bbox.width,
        text: run.text.replaceAll(/\s/g, ""),
        hasActualText: run.viaActualText,
      })),
  );
}

/** 压印钉集装配：证据 PA11F 资源 tag（解析期事实）→ 每页页眉/页脚归一串。 */
function collectStampExpectations(
  evidence: WenshuPdfEvidence,
  mismatches: Mismatch[],
): Map<number, StampStripExpectation> {
  const byPage = new Map<number, { header?: string; footer?: string; count: number }>();
  for (const run of evidence.textRuns) {
    if (!/^PA11F\d+$/u.test(run.font.tag)) {
      continue;
    }
    const entry = byPage.get(run.pageIndex) ?? { count: 0 };
    entry.count += 1;
    const norm = normalizePdfText(run.text);
    if (/^\d+\/\d+$/u.test(norm)) {
      entry.footer = norm;
    } else {
      entry.header = norm;
    }
    byPage.set(run.pageIndex, entry);
  }
  const expectations = new Map<number, StampStripExpectation>();
  for (const [pageIndex, entry] of byPage) {
    if (entry.header === undefined || entry.footer === undefined || entry.count !== 2) {
      mismatches.push({
        kind: "stamp-shape",
        pageIndex,
        detail: `runs=${entry.count} header=${entry.header ?? "-"} footer=${entry.footer ?? "-"}`,
      });
      continue;
    }
    expectations.set(pageIndex, { header: entry.header, footer: entry.footer });
  }
  return expectations;
}

function failReport(code: string, location: string): CrosscheckReport {
  return {
    ok: false,
    pagesChecked: 0,
    linesChecked: 0,
    figuresChecked: 0,
    mismatches: [{ kind: "evidence", pageIndex: -1, detail: `${code}@${location}` }],
    actualTextDivergences: [],
  };
}

function compareLines(
  pageIndex: number,
  ours: readonly OracleLine[],
  theirs: readonly OracleLine[],
  mismatches: Mismatch[],
  divergences: Mismatch[],
): number {
  let checked = 0;
  if (ours.length !== theirs.length) {
    mismatches.push({
      kind: "line-count",
      pageIndex,
      detail: `oracle=${theirs.length} evidence=${ours.length}`,
    });
  }
  for (let line = 0; line < Math.min(ours.length, theirs.length); line += 1) {
    const a = ours[line];
    const b = theirs[line];
    if (a === undefined || b === undefined) {
      continue;
    }
    checked += 1;
    // 文本语义面口径与 PA-05 对账一致：部首→CJK、NFKC、剥离空白。
    // ActualText span 行：pdf.js 回退 ToUnicode（部首形/figure dash），记信息项。
    if (normalizePdfText(a.text) !== normalizePdfText(b.text)) {
      const divergence: Mismatch = {
        kind: "line-text",
        pageIndex,
        detail: `line=${line}`,
      };
      if (a.hasActualText) {
        divergences.push(divergence);
      } else {
        mismatches.push(divergence);
      }
    }
    if (Math.abs(a.baselineY - b.baselineY) > LINE_BASELINE_TOLERANCE_PT) {
      mismatches.push({
        kind: "line-baseline",
        pageIndex,
        detail: `line=${line} d=${Math.abs(a.baselineY - b.baselineY)}`,
      });
    }
    if (Math.abs(a.minX - b.minX) > LINE_X_TOLERANCE_PT) {
      mismatches.push({
        kind: "line-x",
        pageIndex,
        detail: `line=${line} d=${Math.abs(a.minX - b.minX)}`,
      });
    }
    if (Math.abs(a.maxX - a.minX - (b.maxX - b.minX)) > LINE_WIDTH_TOLERANCE_PT) {
      mismatches.push({
        kind: "line-width",
        pageIndex,
        detail: `line=${line} d=${Math.abs(a.maxX - a.minX - (b.maxX - b.minX))}`,
      });
    }
  }
  return checked;
}

export async function crosscheckGeometry(bytes: Uint8Array): Promise<CrosscheckReport> {
  const extracted = extractEvidence(bytes);
  if (!extracted.ok) {
    return failReport(extracted.issue.code, extracted.issue.location);
  }
  const evidence = extracted.evidence;
  const mismatches: Mismatch[] = [];
  const actualTextDivergences: Mismatch[] = [];
  const stampExpectations = collectStampExpectations(evidence, mismatches);
  const oracle = await extractOracle(bytes, stampExpectations);
  let linesChecked = 0;
  let figuresChecked = 0;

  if (oracle.length !== evidence.pages.length) {
    mismatches.push({
      kind: "page-count",
      pageIndex: -1,
      detail: `oracle=${oracle.length} evidence=${evidence.pages.length}`,
    });
  }
  for (const page of evidence.pages) {
    const oraclePage = oracle[page.index];
    if (oraclePage === undefined) {
      continue;
    }
    const viewW = (oraclePage.view[2] ?? 0) - (oraclePage.view[0] ?? 0);
    const viewH = (oraclePage.view[3] ?? 0) - (oraclePage.view[1] ?? 0);
    if (Math.abs(viewW - page.widthPt) > PAGE_BOX_TOLERANCE_PT) {
      mismatches.push({
        kind: "page-width",
        pageIndex: page.index,
        detail: `oracle=${viewW} evidence=${page.widthPt}`,
      });
    }
    if (Math.abs(viewH - page.heightPt) > PAGE_BOX_TOLERANCE_PT) {
      mismatches.push({
        kind: "page-height",
        pageIndex: page.index,
        detail: `oracle=${viewH} evidence=${page.heightPt}`,
      });
    }

    if (oraclePage.stampTailViolation !== null) {
      mismatches.push({
        kind: "stamp-tail",
        pageIndex: page.index,
        detail: oraclePage.stampTailViolation,
      });
    }

    linesChecked += compareLines(
      page.index,
      evidenceLines(evidence, page.index),
      oraclePage.lines,
      mismatches,
      actualTextDivergences,
    );

    const ourFigures = evidence.figures.filter(
      (figure) => figure.pageIndex === page.index,
    );
    if (ourFigures.length !== oraclePage.figures.length) {
      mismatches.push({
        kind: "figure-count",
        pageIndex: page.index,
        detail: `oracle=${oraclePage.figures.length} evidence=${ourFigures.length}`,
      });
    }
    for (
      let figure = 0;
      figure < Math.min(ourFigures.length, oraclePage.figures.length);
      figure += 1
    ) {
      const oursFigure = ourFigures[figure];
      const theirsFigure = oraclePage.figures[figure];
      if (oursFigure === undefined || theirsFigure === undefined) {
        continue;
      }
      figuresChecked += 1;
      // y 向上空间：bbox.y 为顶边（max y），底边 = y - height。
      const edges: readonly (readonly [string, number])[] = [
        ["left", Math.abs(oursFigure.bbox.x - theirsFigure.minX)],
        ["top", Math.abs(oursFigure.bbox.y - theirsFigure.maxY)],
        [
          "right",
          Math.abs(oursFigure.bbox.x + oursFigure.bbox.width - theirsFigure.maxX),
        ],
        [
          "bottom",
          Math.abs(oursFigure.bbox.y - oursFigure.bbox.height - theirsFigure.minY),
        ],
      ];
      for (const [edge, diff] of edges) {
        if (diff > FIGURE_EDGE_TOLERANCE_PT) {
          mismatches.push({
            kind: "figure-edge",
            pageIndex: page.index,
            detail: `figure=${figure} ${edge} d=${diff}`,
          });
        }
      }
      // 绘制框（v1.1.0）：oracle 侧只计 fill/stroke 家族的 constructPath；
      // 本方 paintBBox 另含成员文本 run 包围盒——自家管线图表标签都落在
      // 已绘制背景矩形内，两侧在同一容差下可比（其他管线形态需复核此投影）。
      const ourPaint = oursFigure.paintBBox;
      const theirPaint = theirsFigure.paint ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      const paintEdges: readonly (readonly [string, number])[] = [
        ["left", Math.abs(ourPaint.x - theirPaint.minX)],
        ["top", Math.abs(ourPaint.y - theirPaint.maxY)],
        ["right", Math.abs(ourPaint.x + ourPaint.width - theirPaint.maxX)],
        ["bottom", Math.abs(ourPaint.y - ourPaint.height - theirPaint.minY)],
      ];
      for (const [edge, diff] of paintEdges) {
        if (diff > FIGURE_EDGE_TOLERANCE_PT) {
          mismatches.push({
            kind: "figure-paint-edge",
            pageIndex: page.index,
            detail: `figure=${figure} ${edge} d=${diff}`,
          });
        }
      }
    }
  }
  return {
    ok: mismatches.length === 0,
    pagesChecked: evidence.pages.length,
    linesChecked,
    figuresChecked,
    mismatches,
    actualTextDivergences,
  };
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  const path = process.argv[2];
  if (path === undefined) {
    console.error("usage: node scripts/oracle-crosscheck.ts <pdf>");
    process.exit(2);
  }
  const bytes = new Uint8Array(readFileSync(path));
  const report = await crosscheckGeometry(bytes);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
