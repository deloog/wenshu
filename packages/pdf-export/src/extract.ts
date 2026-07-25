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
  /\/ActualText\s*<([0-9A-Fa-f]+)>\s*>>\s*BDC|\bEMC\b|\/([A-Za-z0-9]+)\s+([\d.]+)\s+Tf|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|(-?[\d.]+)\s+(-?[\d.]+)\s+T[Dd]\b|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+cm\b|\b(q|Q)\b|<([0-9A-Fa-f]+)>\s*Tj|\[((?:[^\])]*))\]\s*TJ/gu;

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
      parts: [],
      origins: [],
      holes: [],
    };
    runs.push(run);
    return run;
  };
  let run = newRun(0, 0, fontSize);

  const moveTo = (): void => {
    const [atX, atY] = apply(ctm, tm[4], tm[5]);
    if (run.parts.length === 0 && run.holes.length === 0) {
      // 空 run：直接改坐标，不产生碎片。
      runs[runs.indexOf(run)] = run = {
        x: atX,
        y: atY,
        fontSize,
        parts: [],
        origins: [],
        holes: [],
      };
      return;
    }
    run = newRun(atX, atY, fontSize);
  };

  const pushText = (text: string, origin: GlyphOrigin | null): void => {
    run.parts.push(text);
    run.origins.push(origin);
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
      // 字体选择在 span 内也要更新身份（span 有自己的 Tf），但 cmap 只在非抑制态使用。
      currentFontId = fontIds.get(token[2]) ?? 0;
      if (suppress === 0) {
        current = fonts.get(token[2]);
        fontSize = Number(token[3]) || fontSize;
      }
      continue;
    }
    if (token[4] !== undefined) {
      // Tm：a b c d e f Tm → 文本矩阵替换，位置 = CTM × (e, f)
      tm = [
        Number(token[4]),
        Number(token[5]),
        Number(token[6]),
        Number(token[7]),
        Number(token[8]),
        Number(token[9]),
      ];
      moveTo();
      continue;
    }
    if (token[10] !== undefined) {
      // Td/TD：dx dy → 文本矩阵平移
      tm = multiply([1, 0, 0, 1, Number(token[10]), Number(token[11])], tm);
      moveTo();
      continue;
    }
    if (token[12] !== undefined) {
      // cm：当前变换矩阵乘入
      ctm = multiply(ctm, [
        Number(token[12]),
        Number(token[13]),
        Number(token[14]),
        Number(token[15]),
        Number(token[16]),
        Number(token[17]),
      ]);
      continue;
    }
    if (token[18] !== undefined) {
      if (token[18] === "q") {
        ctmStack.push(ctm);
      } else {
        ctm = ctmStack.pop() ?? IDENTITY;
      }
      continue;
    }
    const hexRun = token[19];
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
    const array = token[20];
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

  // 排序：设备空间 y 向上，阅读序 = y 降序 + x 升序；稳定排序保持流内次序。
  const Y_BUCKET = 8;
  const sorted = [...runs].sort((a, b) => {
    const bucketA = Math.round(a.y / Y_BUCKET);
    const bucketB = Math.round(b.y / Y_BUCKET);
    if (bucketA !== bucketB) {
      return bucketB - bucketA;
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
