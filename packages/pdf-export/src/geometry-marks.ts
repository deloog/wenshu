/**
 * 几何提取的标记内容栈与 /Figure span 累积机制（geometry-text.ts 的配套件）。
 * 成员判定与绘制包围盒都是解析期结构事实：
 * - 成员 = 字形发出时 /Figure BDC…EMC span 在栈上（禁几何启发式，决策 #10）；
 * - paintBox = 仅绘制算子（f/F/S/s/B/b 家族）消费的路径点 + span 内文本 run
 *   包围盒的并集；clip（W n）只进 box、不进 paintBox（PDF 语义：clip 不绘制）。
 */

export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Matrix, x: number, y: number): readonly [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export interface FigureBox {
  readonly mcid: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  paintMinX: number;
  paintMinY: number;
  paintMaxX: number;
  paintMaxY: number;
}

export function newFigureBox(mcid: number): FigureBox {
  return {
    mcid,
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    paintMinX: Infinity,
    paintMinY: Infinity,
    paintMaxX: -Infinity,
    paintMaxY: -Infinity,
  };
}

export interface Mark {
  readonly kind: "actual" | "block" | "figure" | "other";
  readonly box?: FigureBox;
}

/** 栈顶向下首个 /Figure span 的 MCID；无则 null。成员判定的唯一事实源。 */
export function enclosingFigureMcid(stack: readonly Mark[]): number | null {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const box = stack[index]?.box;
    if (box !== undefined) {
      return box.mcid;
    }
  }
  return null;
}

function grow(box: FigureBox, x: number, y: number): void {
  box.minX = Math.min(box.minX, x);
  box.minY = Math.min(box.minY, y);
  box.maxX = Math.max(box.maxX, x);
  box.maxY = Math.max(box.maxY, y);
}

function growPaint(box: FigureBox, x: number, y: number): void {
  box.paintMinX = Math.min(box.paintMinX, x);
  box.paintMinY = Math.min(box.paintMinY, y);
  box.paintMaxX = Math.max(box.paintMaxX, x);
  box.paintMaxY = Math.max(box.paintMaxY, y);
}

/** 路径构造点计入 figure box（含 clip 矩形，PA-06 既有语义）。 */
export function growFigurePaths(
  stack: readonly Mark[],
  ctm: Matrix,
  coords: readonly number[],
): void {
  for (const mark of stack) {
    if (mark.box === undefined) {
      continue;
    }
    for (let index = 0; index + 1 < coords.length; index += 2) {
      const [px, py] = apply(ctm, coords[index] ?? 0, coords[index + 1] ?? 0);
      grow(mark.box, px, py);
    }
  }
}

/** 绘制算子消费的路径点计入 figure paintBox（clip 不调用本函数）。 */
export function growFigurePaint(
  stack: readonly Mark[],
  ctm: Matrix,
  coords: readonly number[],
): void {
  for (const mark of stack) {
    if (mark.box === undefined) {
      continue;
    }
    for (let index = 0; index + 1 < coords.length; index += 2) {
      const [px, py] = apply(ctm, coords[index] ?? 0, coords[index + 1] ?? 0);
      growPaint(mark.box, px, py);
    }
  }
}

/** span 内文本 run 的包围盒：文本是绘制内容，box 与 paintBox 同增。 */
export function growFigureText(
  box: FigureBox,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  grow(box, x0, y0);
  grow(box, x1, y1);
  growPaint(box, x0, y0);
  growPaint(box, x1, y1);
}
