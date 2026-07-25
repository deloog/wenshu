import type { GlyphOrigin } from "./cmap-repair.ts";
import type { TextHole } from "./inspect.ts";
import { PdfExportError } from "./errors.ts";

/**
 * 位置感知文本提取：PDF 文本算子不保证阅读序（Skia 在图表区按字体组发射）。
 * 跟踪 Tm/Td 位置，把文本片段按（行桶 y, x）稳定排序——正文流内序保持不变，
 * 图表区恢复视觉阅读序。
 */

export interface ToUnicodeMap {
  readonly codeLength: number;
  readonly map: Map<number, string>;
}

interface RunHole {
  readonly localOffset: number;
  readonly fontObjectId: number;
  readonly code: number;
}

interface TextRun {
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly blockOrder: number;
  readonly parts: string[];
  readonly origins: (GlyphOrigin | null)[];
  readonly holes: RunHole[];
}

export interface OrderedExtraction {
  readonly text: string;
  readonly holes: TextHole[];
  readonly origins: (GlyphOrigin | null)[];
}

function utf16beHexToString(hex: string): string {
  const bytes = Buffer.from(hex, "hex");
  return bytes.swap16().toString("utf16le");
}

function fail(message: string): never {
  throw new PdfExportError("PDF_INSPECT_UNSUPPORTED", message);
}

const TOKEN =
  /\/ActualText\s*<([0-9A-Fa-f]+)>\s*>>\s*BDC|\bEMC\b|\/NonStruct\s*<<\s*\/MCID\s+(\d+)\s*>>\s*BDC|\/([A-Za-z0-9]+)\s+([\d.]+)\s+Tf|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|(-?[\d.]+)\s+(-?[\d.]+)\s+T[Dd]\b|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+cm\b|\b(q|Q)\b|<([0-9A-Fa-f]+)>\s*Tj|\[((?:[^\])]*))\]\s*TJ/gu;

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

export function extractOrderedText(
  content: string,
  fonts: Map<string, ToUnicodeMap>,
  fontIds: Map<string, number>,
  pageIndex: number,
  baseOffset: number,
  contentObjectId: number,
): OrderedExtraction {
  const runs: TextRun[] = [];
  let current: ToUnicodeMap | undefined;
  let currentFontId = 0;
  let fontSize = 0;
  let ctm: Matrix = IDENTITY;
  const ctmStack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let suppress = 0;
  let spanIndex = -1;
  let pendingSpanText: string | undefined;
  let pendingSpanGlyph: { fontObjectId: number; code: number } | undefined;

  const flushSpanText = (): void => {
    if (pendingSpanText === undefined) {
      return;
    }
    const text = pendingSpanText;
    const glyph = pendingSpanGlyph;
    pendingSpanText = undefined;
    pushText(
      text,
      glyph === undefined
        ? null
        : Object.freeze({
            fontObjectId: glyph.fontObjectId,
            code: glyph.code,
            viaActualText: true,
            spanIndex,
            contentObjectId,
          }),
    );
  };

  const newRun = (atX: number, atY: number, size: number): TextRun => {
    const run: TextRun = {
      x: atX,
      y: atY,
      fontSize: size,
      blockOrder,
      parts: [],
      origins: [],
      holes: [],
    };
    runs.push(run);
    return run;
  };
  let blockOrder = 0;
  let run = newRun(0, 0, fontSize);

  const moveTo = (): void => {
    const [atX, atY] = apply(ctm, tm[4], tm[5]);
    if (run.parts.length === 0 && run.holes.length === 0) {
      // 空 run：直接改坐标，不产生碎片。
      runs[runs.indexOf(run)] = run = {
        x: atX,
        y: atY,
        fontSize,
        blockOrder,
        parts: [],
        origins: [],
        holes: [],
      };
      return;
    }
    run = newRun(atX, atY, fontSize);
  };

  const pushText = (text: string, origin: GlyphOrigin | null): void => {
    // origins 与 text 逐码点对齐：多字符文本仅首字符携带来源，其余补 null。
    run.parts.push(text);
    run.origins.push(origin);
    for (let index = 1; index < [...text].length; index += 1) {
      run.origins.push(null);
    }
  };

  for (const token of content.matchAll(TOKEN)) {
    if (token[1] !== undefined) {
      // ActualText：文本推迟到 span 内首个字形位置再入 run（span 的 Tm 可能在其后）。
      pendingSpanText = utf16beHexToString(token[1]);
      spanIndex += 1;
      pendingSpanGlyph = undefined;
      suppress += 1;
      continue;
    }
    if (token[0] === "EMC") {
      flushSpanText();
      pendingSpanGlyph = undefined;
      suppress = Math.max(0, suppress - 1);
      continue;
    }
    if (token[2] !== undefined) {
      // MCID 块序：/NonStruct <</MCID n>> BDC 为逻辑块（单元格/段落）边界。
      blockOrder += 1;
      continue;
    }
    if (token[3] !== undefined) {
      // 字体状态跟随 Tf 始终更新（span 内 Tf 在 EMC 后依然有效）；抑制只跳过字形解码。
      current = fonts.get(token[3]);
      currentFontId = fontIds.get(token[3]) ?? 0;
      fontSize = Number(token[4]) || fontSize;
      continue;
    }
    if (token[5] !== undefined) {
      // Tm：a b c d e f Tm → 文本矩阵替换，位置 = CTM × (e, f)
      tm = [
        Number(token[5]),
        Number(token[6]),
        Number(token[7]),
        Number(token[8]),
        Number(token[9]),
        Number(token[10]),
      ];
      moveTo();
      continue;
    }
    if (token[11] !== undefined) {
      // Td/TD：dx dy → 文本矩阵平移
      tm = multiply([1, 0, 0, 1, Number(token[11]), Number(token[12])], tm);
      moveTo();
      continue;
    }
    if (token[13] !== undefined) {
      // cm：当前变换矩阵乘入
      ctm = multiply(ctm, [
        Number(token[13]),
        Number(token[14]),
        Number(token[15]),
        Number(token[16]),
        Number(token[17]),
        Number(token[18]),
      ]);
      continue;
    }
    if (token[19] !== undefined) {
      if (token[19] === "q") {
        ctmStack.push(ctm);
      } else {
        ctm = ctmStack.pop() ?? IDENTITY;
      }
      continue;
    }
    const hexRun = token[20];
    if (hexRun !== undefined) {
      const codeLength = current?.codeLength ?? 1;
      for (
        let index = 0;
        index + codeLength * 2 <= hexRun.length;
        index += codeLength * 2
      ) {
        const code = Number.parseInt(hexRun.slice(index, index + codeLength * 2), 16);
        if (suppress > 0) {
          pendingSpanGlyph ??= { fontObjectId: currentFontId, code };
          flushSpanText();
          continue;
        }
        emit(code, current, currentFontId, contentObjectId, run, pushText);
      }
      continue;
    }
    const array = token[21];
    if (array !== undefined) {
      const codeLength = current?.codeLength ?? 1;
      for (const piece of array.matchAll(/<([0-9A-Fa-f]+)>/g)) {
        const hex = piece[1] ?? "";
        for (
          let index = 0;
          index + codeLength * 2 <= hex.length;
          index += codeLength * 2
        ) {
          const code = Number.parseInt(hex.slice(index, index + codeLength * 2), 16);
          if (suppress > 0) {
            pendingSpanGlyph ??= { fontObjectId: currentFontId, code };
            flushSpanText();
            continue;
          }
          emit(code, current, currentFontId, contentObjectId, run, pushText);
        }
      }
    }
  }

  // 排序：MCID 逻辑块序优先；块内 y 桶降序（8，小于正文行距）+ x 升序，稳定排序。
  // 同块内大基线偏移（如单元格尾字）落在块内行序之后——正是它应在的位置。
  const Y_BUCKET = 8;
  const sorted = [...runs].sort((a, b) => {
    if (a.blockOrder !== b.blockOrder) {
      return a.blockOrder - b.blockOrder;
    }
    const clusterA = Math.round(a.y / Y_BUCKET);
    const clusterB = Math.round(b.y / Y_BUCKET);
    if (clusterA !== clusterB) {
      return clusterB - clusterA;
    }
    return a.x - b.x;
  });

  const parts: string[] = [];
  const origins: (GlyphOrigin | null)[] = [];
  const holes: TextHole[] = [];
  let offset = baseOffset;
  for (const sortedRun of sorted) {
    const text = sortedRun.parts.join("");
    if (text.length === 0 && sortedRun.holes.length === 0) {
      continue;
    }
    for (const hole of sortedRun.holes) {
      holes.push(
        Object.freeze({
          pageIndex,
          offset: offset + hole.localOffset,
          fontObjectId: hole.fontObjectId,
          code: hole.code,
        }),
      );
    }
    parts.push(text);
    origins.push(...sortedRun.origins);
    offset += [...text].length;
  }
  void fail;
  return Object.freeze({ text: parts.join(""), holes, origins });
}

function emit(
  code: number,
  current: ToUnicodeMap | undefined,
  currentFontId: number,
  contentObjectId: number,
  run: TextRun,
  pushText: (text: string, origin: GlyphOrigin | null) => void,
): void {
  const mapped = current?.map.get(code);
  if (
    process.env["PDF_DEBUG_F65"] === "1" &&
    (currentFontId === 65 || currentFontId === 40)
  ) {
    console.error(
      "F65 emit code",
      code.toString(16),
      "->",
      JSON.stringify(mapped),
      "mapSize",
      current?.map.size,
    );
  }
  const localOffset = [...run.parts.join("")].length;
  if (mapped === undefined) {
    run.holes.push({ localOffset, fontObjectId: currentFontId, code });
    return;
  }
  pushText(
    mapped,
    Object.freeze({
      fontObjectId: currentFontId,
      code,
      viaActualText: false,
      spanIndex: -1,
      contentObjectId,
    }),
  );
}
