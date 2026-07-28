/**
 * oracle 的 pdf.js 侧提取：独立解析页框、文本项、figure 路径框。
 * pdfjs-dist（Apache-2.0）与被测自写解析器零共享代码；本模块只做事实提取，
 * 比对逻辑见 oracle-crosscheck.ts。
 *
 * 坐标系：pdf.js getTextContent 的 transform 与 operator list 的 minMax 均在
 * PDF 默认用户空间（y 向上），与证据模型一致，无需翻转。
 */
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

import { normalizePdfText } from "@wenshu/pdf-export";

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

export interface OracleLine {
  readonly baselineY: number;
  readonly minX: number;
  readonly maxX: number;
  readonly text: string;
  readonly hasActualText: boolean;
}

/**
 * 压印行剥离钉（PA-11A）：某页期望在提取尾部出现的页眉/页脚归一串。
 * 压印流以 /Contents 追加，内容序必居页尾（位置锚定事实）；pdf.js 对
 * Skia Type3 字体的行内位置启发式（worker 41572 isCharBBox 分支）会错位
 * 压印行，故两侧在比对前剥离——压印几何由对账链（后缀锚定剥离/交叠自检/
 * 压印单测）覆盖，不属于本 oracle 域（引擎产出字节的几何交叉验证）。
 */
export interface StampStripExpectation {
  /** 归一化页眉串（如 short_title）。 */
  readonly header: string;
  /** 归一化页脚串（如 "2/21"）。 */
  readonly footer: string;
}

export interface OracleFigure {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** 仅绘制算子（fill/stroke 家族）的并集；clip/endPath 不计入。无绘制为 null。 */
  readonly paint: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  } | null;
}

/** pdf.js constructPath args[0] 中的绘制算子（OPS 值）；endPath/clip/eoClip 不绘制。 */
const PAINT_OPS: ReadonlySet<number> = new Set([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);

export interface OraclePage {
  readonly view: readonly number[];
  readonly lines: readonly OracleLine[];
  readonly figures: readonly OracleFigure[];
  /** 压印尾部剥离违规（fail-closed 记录；无压印钉的页为 null）。 */
  readonly stampTailViolation: string | null;
}

/** 行聚合的输入 run（两侧各自从自己的解析结果投影而来）。 */
export interface LineRun {
  readonly x: number;
  readonly baselineY: number;
  readonly maxX: number;
  readonly text: string;
  readonly hasActualText: boolean;
}

/** 两侧共用的行聚合（基线 2pt 桶、行内 x 升序拼接）——只是分桶，不参与事实判定。 */
export function bucketRuns(runs: readonly LineRun[]): OracleLine[] {
  const sorted = [...runs].sort((a, b) => b.baselineY - a.baselineY || a.x - b.x);
  const lines: OracleLine[] = [];
  for (const run of sorted) {
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
  interface MutableBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  let current: MutableBox | null = null;
  let currentPaint: MutableBox | null = null;
  const unionInto = (
    target: MutableBox | null,
    minMax: readonly number[],
  ): MutableBox => {
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
    return target === null
      ? box
      : {
          minX: Math.min(target.minX, box.minX),
          minY: Math.min(target.minY, box.minY),
          maxX: Math.max(target.maxX, box.maxX),
          maxY: Math.max(target.maxY, box.maxY),
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
        figures.push({ ...current, paint: currentPaint });
        current = null;
        currentPaint = null;
      }
    } else if (
      fn === OPS.constructPath &&
      markedStack.includes(true) &&
      Array.isArray(args)
    ) {
      const minMax = numbers(args[2], 4);
      if (minMax !== null) {
        current = unionInto(current, minMax);
        if (typeof args[0] === "number" && PAINT_OPS.has(args[0])) {
          currentPaint = unionInto(currentPaint, minMax);
        }
      }
    }
  }
  return figures;
}

/** pdf.js 独立解析：逐页页框 + 文本行 + figure 路径框。 */
export async function extractOracle(
  bytes: Uint8Array,
  stampsByPage?: ReadonlyMap<number, StampStripExpectation>,
): Promise<OraclePage[]> {
  const document = await getDocument({ data: bytes }).promise;
  const pages: OraclePage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    interface TextItem {
      readonly str: string;
      readonly transform: readonly number[];
      readonly width: number;
    }
    const items: TextItem[] = [];
    for (const item of textContent.items) {
      if (!("str" in item)) {
        continue;
      }
      items.push(item as TextItem);
    }
    // 尾部锚定剥离压印项（仅在本方证据钉定该页有压印时启用），fail-closed：
    // 页脚项拼接不等于期望页脚串、或页眉项不等于期望页眉串，都记违规。
    const stampExpectation = stampsByPage?.get(pageNumber - 1);
    let stampTailViolation: string | null = null;
    let end = items.length;
    if (stampExpectation !== undefined) {
      const footerChars: string[] = [];
      let headerDropped = 0;
      while (end > 0) {
        const item = items[end - 1];
        const norm = normalizePdfText(item?.str ?? "");
        if (norm.length === 0) {
          end -= 1;
          continue;
        }
        // 页脚未集齐前只收数字/斜杠项；恰好拼出期望页脚即封停（防吃掉
        // 目录页码等同形正文项——实测 pageIndex 3 目录尾项 "21" 场景）。
        if (
          footerChars.join("") !== stampExpectation.footer &&
          /^[0-9/]+$/u.test(norm)
        ) {
          footerChars.unshift(norm);
          end -= 1;
          continue;
        }
        if (norm === stampExpectation.header) {
          headerDropped += 1;
          end -= 1;
          continue;
        }
        break;
      }
      if (headerDropped !== 1) {
        stampTailViolation = `header items=${headerDropped}`;
      } else if (footerChars.join("") !== stampExpectation.footer) {
        stampTailViolation = `footer=${footerChars.join("")}`;
      }
    }
    const runs: LineRun[] = [];
    for (const item of items.slice(0, end)) {
      const text = item.str.replaceAll(/\s/g, "");
      if (text.length === 0) {
        continue;
      }
      runs.push({
        x: item.transform[4] ?? 0,
        baselineY: item.transform[5] ?? 0,
        maxX: (item.transform[4] ?? 0) + item.width,
        text,
        hasActualText: false,
      });
    }
    const operatorList = await page.getOperatorList();
    pages.push({
      view: page.view,
      lines: bucketRuns(runs),
      figures: collectFigures(operatorList.fnArray, operatorList.argsArray),
      stampTailViolation,
    });
  }
  return pages;
}
