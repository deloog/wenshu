import { PdfExportError } from "./errors.ts";
import type { GeometryFontRef, GeometryTextRun } from "./geometry.ts";

/**
 * 几何保留的内容流切词：算子语义与 extract.ts 完全一致（Tm/Td/cm/q/Q、
 * ActualText 抑制、NonStruct MCID 块序、Y_BUCKET=8 阅读序），额外做两件事：
 * 1. 逐字形累积前进量得到 run 宽度（ActualText span 的宽度来自被抑制字形）；
 * 2. 在 /Figure 标记内容 span 内累积路径点与文本 run 的包围盒。
 * 字形洞（无 ToUnicode 映射）是已知 Skia 缺陷面（见 cmap-repair.ts），此处按
 * 前进量-only 处理：贡献 /Widths 宽度、不产生字符，而不是 fail-closed。
 */

export interface Type3FontGeometry {
  readonly objectId: number;
  readonly ref: GeometryFontRef;
  readonly codeLength: number;
  readonly map: Map<number, string>;
  readonly firstChar: number;
  readonly widths: readonly number[];
  /** /FontMatrix [a b c d e f]（Type3 必需项，缺省即畸形字体）。 */
  readonly fontMatrix: readonly number[];
  /** /FontBBox [x0 y0 x1 y1]，字形空间（Skia 中 y 序可正可反，按两端取值）。 */
  readonly fontBBox: readonly number[];
}

interface FigureBox {
  readonly mcid: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FigureSpanGeometry {
  readonly mcid: number;
  readonly box: FigureBox;
}

export interface ContentGeometry {
  /** 已按 PA-05 阅读序（块序 → y 桶降序 → x 升序）排序的本流 run。 */
  readonly runs: readonly GeometryTextRun[];
  readonly figures: readonly FigureSpanGeometry[];
}

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

function apply(m: Matrix, x: number, y: number): readonly [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function fail(message: string): never {
  throw new PdfExportError("PDF_INSPECT_UNSUPPORTED", message);
}

function numbers(raw: string): number[] {
  return raw
    .trim()
    .split(/\s+/u)
    .map((part) => Number(part));
}

function matrix6(raw: string): Matrix {
  const parts = numbers(raw);
  if (parts.length !== 6 || parts.some((part) => !Number.isFinite(part))) {
    fail("malformed matrix operands");
  }
  return [
    parts[0] ?? 0,
    parts[1] ?? 0,
    parts[2] ?? 0,
    parts[3] ?? 0,
    parts[4] ?? 0,
    parts[5] ?? 0,
  ];
}

function utf16beHexToString(hex: string): string {
  const bytes = Buffer.from(hex, "hex");
  return bytes.swap16().toString("utf16le");
}

const TOKEN =
  /\/ActualText\s*<(?<actual>[0-9A-Fa-f]+)>\s*>>\s*BDC|\/(?<mark>[A-Za-z0-9]+)\s*<<\s*\/MCID\s+(?<mcid>\d+)\s*>>\s*BDC|\bEMC\b|\/(?<font>[A-Za-z0-9]+)\s+(?<size>[\d.]+)\s+Tf|(?<tm>(?:-?[\d.]+\s+){5}-?[\d.]+)\s+Tm|(?<td>-?[\d.]+\s+-?[\d.]+)\s+T[Dd]\b|(?<cm>(?:-?[\d.]+\s+){5}-?[\d.]+)\s+cm\b|(?<re>(?:-?[\d.]+\s+){3}-?[\d.]+)\s+re\b|(?<c6>(?:-?[\d.]+\s+){5}-?[\d.]+)\s+c\b|(?<c4>(?:-?[\d.]+\s+){3}-?[\d.]+)\s+[vy]\b|(?<p2>-?[\d.]+\s+-?[\d.]+)\s+[ml]\b|\b(?<state>q|Q|h)\b|<(?<tj>[0-9A-Fa-f]+)>\s*Tj|\[(?<tjArr>[^\]]*)\]\s*TJ/gu;

interface Mark {
  readonly kind: "actual" | "block" | "figure" | "other";
  readonly box?: FigureBox;
}

interface GeomRun {
  x: number;
  y: number;
  fontSize: number;
  blockOrder: number;
  /** run 起点处的合成矩阵 CTM×Tm，用于把 fontBBox 高度变换到设备空间。 */
  m: Matrix;
  font: Type3FontGeometry | undefined;
  parts: string[];
  width: number;
  viaActualText: boolean;
  spans: Set<FigureBox>;
}

export function extractContentGeometry(
  content: string,
  fonts: Map<string, Type3FontGeometry>,
  pageIndex: number,
): ContentGeometry {
  const runs: GeometryTextRun[] = [];
  const figures: FigureSpanGeometry[] = [];
  const markStack: Mark[] = [];
  let current: Type3FontGeometry | undefined;
  let fontSize = 0;
  let ctm: Matrix = IDENTITY;
  const ctmStack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let suppress = 0;
  let pendingSpanText: string | undefined;
  let blockOrder = 0;

  const newRun = (atX: number, atY: number): GeomRun => ({
    x: atX,
    y: atY,
    fontSize,
    blockOrder,
    m: multiply(ctm, tm),
    font: current,
    parts: [],
    width: 0,
    viaActualText: false,
    spans: new Set<FigureBox>(),
  });
  let run = newRun(0, 0);

  const grow = (box: FigureBox, x: number, y: number): void => {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  };
  const growPath = (coords: readonly number[]): void => {
    for (const mark of markStack) {
      if (mark.box === undefined) {
        continue;
      }
      for (let index = 0; index + 1 < coords.length; index += 2) {
        const [px, py] = apply(ctm, coords[index] ?? 0, coords[index + 1] ?? 0);
        grow(mark.box, px, py);
      }
    }
  };
  const flushRun = (): void => {
    const text = run.parts.join("");
    if (text === "") {
      // 空 run（含仅字形洞的 run）不产生几何事实。
      return;
    }
    if (run.font === undefined) {
      fail("text run without an active font");
    }
    const fm = run.font.fontMatrix;
    const offsets = [run.font.fontBBox[1] ?? 0, run.font.fontBBox[3] ?? 0].map((gy) => {
      // 字形点 (0, gy) 经 FontMatrix 到文本空间，再经 CTM×Tm 变为设备 y 偏移。
      const tx = (fm[2] ?? 0) * gy;
      const ty = (fm[3] ?? 0) * gy;
      return (run.m[1] * tx + run.m[3] * ty) * run.fontSize;
    });
    const top = Math.max(...offsets);
    const bottom = Math.min(...offsets);
    const bbox = Object.freeze({
      x: run.x,
      y: run.y + top,
      width: run.width,
      height: top - bottom,
    });
    for (const box of run.spans) {
      grow(box, bbox.x, bbox.y);
      grow(box, bbox.x + bbox.width, bbox.y - bbox.height);
    }
    runs.push(
      Object.freeze({
        pageIndex,
        text,
        bbox,
        baselineY: run.y,
        fontSize: run.fontSize,
        font: run.font.ref,
        blockOrder: run.blockOrder,
        viaActualText: run.viaActualText,
      }),
    );
  };
  const moveTo = (): void => {
    const [atX, atY] = apply(ctm, tm[4], tm[5]);
    if (run.parts.length === 0 && run.width === 0) {
      // 空 run：直接改坐标，不产生碎片（与 extract.ts 同规则）。
      run.x = atX;
      run.y = atY;
      run.fontSize = fontSize;
      run.blockOrder = blockOrder;
      run.m = multiply(ctm, tm);
      run.font = current;
      return;
    }
    flushRun();
    run = newRun(atX, atY);
  };
  const advance = (code: number): number => {
    if (current === undefined) {
      return 0;
    }
    const glyph = current.widths[code - current.firstChar] ?? 0;
    const m = multiply(ctm, tm);
    return glyph * (current.fontMatrix[0] ?? 0) * fontSize * Math.hypot(m[0], m[1]);
  };
  const emitHex = (hex: string): void => {
    const codeLength = current?.codeLength ?? 1;
    for (let index = 0; index + codeLength * 2 <= hex.length; index += codeLength * 2) {
      const code = Number.parseInt(hex.slice(index, index + codeLength * 2), 16);
      run.width += advance(code);
      for (const mark of markStack) {
        if (mark.box !== undefined) {
          run.spans.add(mark.box);
        }
      }
      if (suppress > 0) {
        if (pendingSpanText !== undefined) {
          run.parts.push(pendingSpanText);
          run.viaActualText = true;
          pendingSpanText = undefined;
        }
        continue;
      }
      // 字形洞：只贡献宽度，不产生字符（见文件头注释）。
      const mapped = current?.map.get(code);
      if (mapped !== undefined) {
        run.parts.push(mapped);
      }
    }
  };

  for (const token of content.matchAll(TOKEN)) {
    const g = token.groups ?? {};
    if (g["actual"] !== undefined) {
      pendingSpanText = utf16beHexToString(g["actual"]);
      suppress += 1;
      markStack.push({ kind: "actual" });
      continue;
    }
    if (token[0] === "EMC") {
      const mark = markStack.pop();
      if (mark?.kind === "actual") {
        suppress = Math.max(0, suppress - 1);
        if (pendingSpanText !== undefined) {
          // span 内无字形：文本落入当前 run，宽度保持已累积值。
          run.parts.push(pendingSpanText);
          run.viaActualText = true;
          pendingSpanText = undefined;
        }
      }
      if (mark?.box !== undefined) {
        figures.push(Object.freeze({ mcid: mark.box.mcid, box: mark.box }));
      }
      pendingSpanText = undefined;
      continue;
    }
    if (g["mark"] !== undefined) {
      if (g["mark"] === "Figure") {
        markStack.push({
          kind: "figure",
          box: {
            mcid: Number(g["mcid"]),
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity,
          },
        });
      } else {
        if (g["mark"] === "NonStruct") {
          // 与 extract.ts 一致：仅 NonStruct MCID 推进逻辑块序。
          blockOrder += 1;
        }
        markStack.push({ kind: g["mark"] === "NonStruct" ? "block" : "other" });
      }
      continue;
    }
    if (g["font"] !== undefined) {
      current = fonts.get(g["font"]);
      fontSize = Number(g["size"]) || fontSize;
      continue;
    }
    if (g["tm"] !== undefined) {
      tm = matrix6(g["tm"]);
      moveTo();
      continue;
    }
    if (g["td"] !== undefined) {
      const [dx, dy] = numbers(g["td"]);
      tm = multiply([1, 0, 0, 1, dx ?? 0, dy ?? 0], tm);
      moveTo();
      continue;
    }
    if (g["cm"] !== undefined) {
      ctm = multiply(ctm, matrix6(g["cm"]));
      continue;
    }
    if (g["state"] !== undefined) {
      if (g["state"] === "q") {
        ctmStack.push(ctm);
      } else if (g["state"] === "Q") {
        ctm = ctmStack.pop() ?? IDENTITY;
      }
      continue;
    }
    if (g["re"] !== undefined) {
      const [rx, ry, rw, rh] = numbers(g["re"]);
      growPath([rx ?? 0, ry ?? 0, (rx ?? 0) + (rw ?? 0), ry ?? 0]);
      growPath([
        rx ?? 0,
        (ry ?? 0) + (rh ?? 0),
        (rx ?? 0) + (rw ?? 0),
        (ry ?? 0) + (rh ?? 0),
      ]);
      continue;
    }
    if (g["c6"] !== undefined) {
      growPath(numbers(g["c6"]).slice(2));
      continue;
    }
    if (g["c4"] !== undefined || g["p2"] !== undefined) {
      growPath(numbers(g["c4"] ?? g["p2"] ?? ""));
      continue;
    }
    if (g["tj"] !== undefined) {
      emitHex(g["tj"]);
      continue;
    }
    if (g["tjArr"] !== undefined) {
      for (const piece of g["tjArr"].matchAll(/(-?[\d.]+)|<([0-9A-Fa-f]+)>/g)) {
        if (piece[2] !== undefined) {
          emitHex(piece[2]);
        } else {
          // TJ 字距：调整量 = -num/1000 × fontSize（文本空间），再乘设备水平比。
          const m = multiply(ctm, tm);
          run.width += (-Number(piece[1]) / 1000) * fontSize * Math.hypot(m[0], m[1]);
        }
      }
    }
  }
  flushRun();

  // 排序与 extract.ts 一致：MCID 块序优先；块内 y 桶降序（8）+ x 升序，稳定排序。
  const Y_BUCKET = 8;
  runs.sort((a, b) => {
    if (a.blockOrder !== b.blockOrder) {
      return a.blockOrder - b.blockOrder;
    }
    const clusterA = Math.round(a.baselineY / Y_BUCKET);
    const clusterB = Math.round(b.baselineY / Y_BUCKET);
    if (clusterA !== clusterB) {
      return clusterB - clusterA;
    }
    return a.bbox.x - b.bbox.x;
  });
  return Object.freeze({
    runs: Object.freeze(runs),
    figures: Object.freeze(figures),
  });
}
