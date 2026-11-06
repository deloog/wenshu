import { PdfExportError } from "./errors.ts";
import type { GeometryFontRef, GeometryTextRun } from "./geometry.ts";
import {
  enclosingFigureMcid,
  growFigurePaint,
  growFigurePaths,
  growFigureText,
  IDENTITY,
  multiply,
  newFigureBox,
  apply,
  type FigureBox,
  type Mark,
  type Matrix,
} from "./geometry-marks.ts";

/**
 * 几何保留的内容流切词：算子语义与 extract.ts 完全一致（Tm/Td/cm/q/Q、
 * ActualText 抑制、NonStruct MCID 块序、Y_BUCKET=8 阅读序），额外做三件事：
 * 1. 逐字形累积前进量得到 run 宽度（ActualText span 的宽度来自被抑制字形）；
 * 2. 在 /Figure 标记内容 span 内累积路径点与文本 run 的包围盒（box 含 clip
 *    矩形；paintBox 只计绘制算子消费的路径，见 geometry-marks.ts）；
 * 3. 逐 run 记录 /Figure 成员标记（figureMcid）：run 的全部字形都在同一个
 *    /Figure span 内发出时为该 span 的 MCID，否则 null——纯解析期结构事实，
 *    不做任何 bbox 几何推断（决策 #10）。
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

export interface FigureSpanGeometry {
  readonly mcid: number;
  readonly box: FigureBox;
}

export interface ContentGeometry {
  /** 已按 PA-05 阅读序（块序 → y 桶降序 → x 升序）排序的本流 run。 */
  readonly runs: readonly GeometryTextRun[];
  readonly figures: readonly FigureSpanGeometry[];
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
  /\/ActualText\s*<(?<actual>[0-9A-Fa-f]+)>\s*>>\s*BDC|\/(?<mark>[A-Za-z0-9]+)\s*<<\s*\/MCID\s+(?<mcid>\d+)\s*>>\s*BDC|\bEMC\b|\/(?<font>[A-Za-z0-9]+)\s+(?<size>[\d.]+)\s+Tf|(?<tm>(?:-?[\d.]+\s+){5}-?[\d.]+)\s+Tm|(?<td>-?[\d.]+\s+-?[\d.]+)\s+T[Dd]\b|(?<cm>(?:-?[\d.]+\s+){5}-?[\d.]+)\s+cm\b|(?<re>(?:-?[\d.]+\s+){3}-?[\d.]+)\s+re\b|(?<c6>(?:-?[\d.]+\s+){5}-?[\d.]+)\s+c\b|(?<c4>(?:-?[\d.]+\s+){3}-?[\d.]+)\s+[vy]\b|(?<p2>-?[\d.]+\s+-?[\d.]+)\s+[ml]\b|\b(?<state>q|Q|h)\b|\b(?<paint>f\*?|F|S|s|B\*?|b\*?)\b|\b(?<discard>n)\b|<(?<tj>[0-9A-Fa-f]+)>\s*Tj|\[(?<tjArr>[^\]]*)\]\s*TJ/gu;

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
  /** 首个字形的 /Figure span 归属（null = 尚无字形或字形在 span 外）。 */
  glyphFigure: number | null;
  sawGlyph: boolean;
  /** 同一 run 的字形跨越不同成员状态（span 内外或多个 figure）→ 非成员。 */
  figureMixed: boolean;
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
  /** 当前未消费路径的构造点（用户空间坐标），由绘制/丢弃算子清空。 */
  let pathPoints: number[] = [];

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
    glyphFigure: null,
    sawGlyph: false,
    figureMixed: false,
  });
  let run = newRun(0, 0);

  /** 成员判定：每个字形（或无字形的 ActualText 落文）按发出时刻的栈状态记账。 */
  const noteGlyphMembership = (): void => {
    const enclosing = enclosingFigureMcid(markStack);
    if (!run.sawGlyph) {
      run.glyphFigure = enclosing;
      run.sawGlyph = true;
      return;
    }
    if (run.glyphFigure !== enclosing) {
      run.figureMixed = true;
    }
  };

  const appendPath = (coords: readonly number[]): void => {
    growFigurePaths(markStack, ctm, coords);
    pathPoints.push(...coords);
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
      growFigureText(box, bbox.x, bbox.y, bbox.x + bbox.width, bbox.y - bbox.height);
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
        figureMcid: run.figureMixed ? null : run.glyphFigure,
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
      run.glyphFigure = null;
      run.sawGlyph = false;
      run.figureMixed = false;
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
      noteGlyphMembership();
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
          noteGlyphMembership();
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
        markStack.push({ kind: "figure", box: newFigureBox(Number(g["mcid"])) });
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
      appendPath([rx ?? 0, ry ?? 0, (rx ?? 0) + (rw ?? 0), ry ?? 0]);
      appendPath([
        rx ?? 0,
        (ry ?? 0) + (rh ?? 0),
        (rx ?? 0) + (rw ?? 0),
        (ry ?? 0) + (rh ?? 0),
      ]);
      continue;
    }
    if (g["c6"] !== undefined) {
      appendPath(numbers(g["c6"]).slice(2));
      continue;
    }
    if (g["c4"] !== undefined || g["p2"] !== undefined) {
      appendPath(numbers(g["c4"] ?? g["p2"] ?? ""));
      continue;
    }
    if (g["paint"] !== undefined) {
      // 绘制算子消费当前路径：paintBox 只计这些点（clip 路径走到 discard）。
      growFigurePaint(markStack, ctm, pathPoints);
      pathPoints = [];
      continue;
    }
    if (g["discard"] !== undefined) {
      pathPoints = [];
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
