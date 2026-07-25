/**
 * 独立几何 oracle：用 pdfjs-dist（Apache-2.0，与自写解析器零共享代码）交叉验证
 * 证据模型的页框 / 文本行几何 / figure 框。
 *
 * 坐标系：pdf.js getTextContent 的 transform 与 operator list 的 minMax 均在
 * PDF 默认用户空间（y 向上），与证据模型一致，无需翻转。
 *
 * 容差（书面化，实测校准）：
 * - 页框：1pt（PA-05 既定事实 A4 594.96–595.92pt 容差 1pt）。
 * - 行基线 / 行起点 x：0.5pt；行宽（末右-首左）：1pt。
 * - 文本逐行比对先剥离全部空白（pdf.js 会按间距启发式补空格，承接 PA-05 归一口径）。
 * - figure 框：路径 minMax 经 operator-list save/restore/transform 链换算，
 *   与证据 bbox 双向各边偏差 ≤2pt。
 *
 * 用法：node scripts/oracle-crosscheck.ts <pdf 路径>；证据为内部 extractEvidence 产物。
 * 退出码：0 = 全部一致；1 = 存在超容差分歧或证据提取失败。
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

import { normalizePdfText } from "@wenshu/pdf-export";

import { extractEvidence } from "../src/extract-evidence.ts";
import type { WenshuPdfEvidence } from "../src/generated/evidence.ts";

const PAGE_BOX_TOLERANCE_PT = 1;
const LINE_BASELINE_TOLERANCE_PT = 0.5;
const LINE_X_TOLERANCE_PT = 0.5;
const LINE_WIDTH_TOLERANCE_PT = 1;
const FIGURE_EDGE_TOLERANCE_PT = 2;
const LINE_BUCKET_PT = 2;

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function applyPoint(m: Matrix, x: number, y: number): readonly [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

interface OracleLine {
  readonly baselineY: number;
  readonly minX: number;
  readonly maxX: number;
  readonly text: string;
  readonly hasActualText: boolean;
}

interface OracleFigure {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface OraclePage {
  readonly view: readonly number[];
  readonly lines: readonly OracleLine[];
  readonly figures: readonly OracleFigure[];
}

interface Mismatch {
  readonly kind: string;
  readonly pageIndex: number;
  readonly detail: string;
}

function numbers(value: unknown, count: number): number[] | null {
  const list: readonly unknown[] | null = Array.isArray(value)
    ? value
    : value instanceof Float32Array
      ? Array.from(value)
      : null;
  if (list === null || list.length < count) {
    return null;
  }
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const item: unknown = list[index];
    if (typeof item !== "number" || Number.isNaN(item)) {
      return null;
    }
    out.push(item);
  }
  return out;
}

/** pdf.js 文本项 → 行（基线桶聚合，行内 x 升序拼接，剥离空白）。 */
function buildLines(
  items: readonly { str: string; transform: number[]; width: number }[],
): OracleLine[] {
  const runs = items
    .filter((item) => item.str.replaceAll(/\s/g, "").length > 0)
    .map((item) => ({
      x: item.transform[4] ?? 0,
      baselineY: item.transform[5] ?? 0,
      maxX: (item.transform[4] ?? 0) + item.width,
      text: item.str.replaceAll(/\s/g, ""),
      hasActualText: false,
    }))
    .sort((a, b) => b.baselineY - a.baselineY || a.x - b.x);
  const lines: OracleLine[] = [];
  for (const run of runs) {
    const last = lines[lines.length - 1];
    if (
      last !== undefined &&
      Math.abs(last.baselineY - run.baselineY) <= LINE_BUCKET_PT
    ) {
      lines[lines.length - 1] = {
        baselineY: last.baselineY,
        minX: Math.min(last.minX, run.x),
        maxX: Math.max(last.maxX, run.maxX),
        text: last.text + run.text,
        hasActualText: last.hasActualText || run.hasActualText,
      };
      continue;
    }
    lines.push({
      baselineY: run.baselineY,
      minX: run.x,
      maxX: run.maxX,
      text: run.text,
      hasActualText: run.hasActualText,
    });
  }
  return lines;
}

/** operator list 走查：save/restore/transform 维护 CTM，Figure 标记内收 constructPath minMax。 */
function collectFigures(
  fnArray: readonly number[],
  argsArray: readonly unknown[],
): OracleFigure[] {
  const figures: OracleFigure[] = [];
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  // 标记内容栈：Figure 内嵌套 NonStruct/ActualText/Lbl，EMC 只弹栈顶，
  // 只有弹出 Figure 本身才闭合当前 figure 累积。
  const markedStack: boolean[] = [];
  let current: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  const include = (minMax: readonly number[]): void => {
    const corners = [
      applyPoint(ctm, minMax[0] ?? 0, minMax[1] ?? 0),
      applyPoint(ctm, minMax[2] ?? 0, minMax[1] ?? 0),
      applyPoint(ctm, minMax[0] ?? 0, minMax[3] ?? 0),
      applyPoint(ctm, minMax[2] ?? 0, minMax[3] ?? 0),
    ];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const box = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    current =
      current === null
        ? box
        : {
            minX: Math.min(current.minX, box.minX),
            minY: Math.min(current.minY, box.minY),
            maxX: Math.max(current.maxX, box.maxX),
            maxY: Math.max(current.maxY, box.maxY),
          };
  };
  for (let index = 0; index < fnArray.length; index += 1) {
    const fn = fnArray[index];
    const args: unknown = argsArray[index];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      const six = numbers(args, 6);
      if (six !== null) {
        const matrix: Matrix = [
          six[0] ?? 1,
          six[1] ?? 0,
          six[2] ?? 0,
          six[3] ?? 1,
          six[4] ?? 0,
          six[5] ?? 0,
        ];
        ctm = multiply(ctm, matrix);
      }
    } else if (fn === OPS.beginMarkedContentProps) {
      const tag = Array.isArray(args) ? args[0] : undefined;
      markedStack.push(tag === "Figure");
    } else if (fn === OPS.endMarkedContent) {
      const wasFigure = markedStack.pop() ?? false;
      if (wasFigure && current !== null) {
        figures.push(current);
        current = null;
      }
    } else if (
      fn === OPS.constructPath &&
      markedStack.includes(true) &&
      Array.isArray(args)
    ) {
      const minMax = numbers(args[2], 4);
      if (minMax !== null) {
        include(minMax);
      }
    }
  }
  return figures;
}

async function extractOracle(bytes: Uint8Array): Promise<OraclePage[]> {
  const document = await getDocument({ data: bytes }).promise;
  const pages: OraclePage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items: { str: string; transform: number[]; width: number }[] = [];
    for (const item of textContent.items) {
      if (!("str" in item)) {
        continue;
      }
      items.push({ str: item.str, transform: item.transform, width: item.width });
    }
    const operatorList = await page.getOperatorList();
    pages.push({
      view: page.view,
      lines: buildLines(items),
      figures: collectFigures(operatorList.fnArray, operatorList.argsArray),
    });
  }
  return pages;
}

function evidenceLines(evidence: WenshuPdfEvidence, pageIndex: number): OracleLine[] {
  const runs = evidence.textRuns
    .filter((run) => run.pageIndex === pageIndex)
    .map((run) => ({
      x: run.bbox.x,
      baselineY: run.baselineY,
      maxX: run.bbox.x + run.bbox.width,
      text: run.text.replaceAll(/\s/g, ""),
      hasActualText: run.viaActualText,
    }))
    .sort((a, b) => b.baselineY - a.baselineY || a.x - b.x);
  const lines: OracleLine[] = [];
  for (const run of runs) {
    const last = lines[lines.length - 1];
    if (
      last !== undefined &&
      Math.abs(last.baselineY - run.baselineY) <= LINE_BUCKET_PT
    ) {
      lines[lines.length - 1] = {
        baselineY: last.baselineY,
        minX: Math.min(last.minX, run.x),
        maxX: Math.max(last.maxX, run.maxX),
        text: last.text + run.text,
        hasActualText: last.hasActualText || run.hasActualText,
      };
      continue;
    }
    lines.push({
      baselineY: run.baselineY,
      minX: run.x,
      maxX: run.maxX,
      text: run.text,
      hasActualText: run.hasActualText,
    });
  }
  return lines;
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

export async function crosscheckGeometry(bytes: Uint8Array): Promise<CrosscheckReport> {
  const extracted = extractEvidence(bytes);
  if (!extracted.ok) {
    return {
      ok: false,
      pagesChecked: 0,
      linesChecked: 0,
      figuresChecked: 0,
      mismatches: [
        {
          kind: "evidence",
          pageIndex: -1,
          detail: `${extracted.issue.code}@${extracted.issue.location}`,
        },
      ],
      actualTextDivergences: [],
    };
  }
  const evidence = extracted.evidence;
  const oracle = await extractOracle(bytes);
  const mismatches: Mismatch[] = [];
  const actualTextDivergences: Mismatch[] = [];
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

    const ours = evidenceLines(evidence, page.index);
    const theirs = oraclePage.lines;
    if (ours.length !== theirs.length) {
      mismatches.push({
        kind: "line-count",
        pageIndex: page.index,
        detail: `oracle=${theirs.length} evidence=${ours.length}`,
      });
    }
    for (let line = 0; line < Math.min(ours.length, theirs.length); line += 1) {
      const a = ours[line];
      const b = theirs[line];
      if (a === undefined || b === undefined) {
        continue;
      }
      linesChecked += 1;
      // 文本语义面口径与 PA-05 对账一致：部首→CJK、NFKC、剥离空白。
      // ActualText span 行：pdf.js 回退 ToUnicode（部首形/figure dash），记为信息项而非不一致。
      if (normalizePdfText(a.text) !== normalizePdfText(b.text)) {
        const divergence: Mismatch = {
          kind: "line-text",
          pageIndex: page.index,
          detail: `line=${line}`,
        };
        if (a.hasActualText) {
          actualTextDivergences.push(divergence);
        } else {
          mismatches.push(divergence);
        }
      }
      if (Math.abs(a.baselineY - b.baselineY) > LINE_BASELINE_TOLERANCE_PT) {
        mismatches.push({
          kind: "line-baseline",
          pageIndex: page.index,
          detail: `line=${line} d=${Math.abs(a.baselineY - b.baselineY)}`,
        });
      }
      if (Math.abs(a.minX - b.minX) > LINE_X_TOLERANCE_PT) {
        mismatches.push({
          kind: "line-x",
          pageIndex: page.index,
          detail: `line=${line} d=${Math.abs(a.minX - b.minX)}`,
        });
      }
      if (Math.abs(a.maxX - a.minX - (b.maxX - b.minX)) > LINE_WIDTH_TOLERANCE_PT) {
        mismatches.push({
          kind: "line-width",
          pageIndex: page.index,
          detail: `line=${line} d=${Math.abs(a.maxX - a.minX - (b.maxX - b.minX))}`,
        });
      }
    }

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
