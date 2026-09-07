import { fail, type FontBinding, type ShowToken } from "./backfill-toc-shared.ts";

// ---------------------------------------------------------------------------
// 内容流轻量扫描器（有序，不是 geometry-text 复用——签署路径零改动）
// ---------------------------------------------------------------------------

/**
 * 词法：字典括号/数组括号/名字/十六进制串/字面串/数字先匹配，余者归为算子
 * （未知算子在分派时 fail-closed）。词素间隙只允许空白，否则流形态未知。
 */
const LEXEME =
  /<<|>>|\[|\]|\/[^\s/<>[\]()]+|<[0-9A-Fa-f]+>|\((?:[^()\\]|\\.)*\)|-?(?:\d+\.\d+|\.\d+|\d+)|[^\s/<>[\]()]+/gu;

/** 图形与文本状态白名单算子：识别但不产生字符。其余算子一律 fail-closed。 */
const PASSIVE_OPS: ReadonlySet<string> = new Set([
  "BT",
  "ET",
  "Tm",
  "Td",
  "TD",
  "T*",
  "cm",
  "q",
  "Q",
  "MP",
  "BX",
  "EX",
  "re",
  "m",
  "l",
  "c",
  "v",
  "y",
  "h",
  "f",
  "F",
  "f*",
  "S",
  "s",
  "B",
  "B*",
  "b",
  "b*",
  "n",
  "W",
  "W*",
  "RG",
  "rg",
  "G",
  "g",
  "K",
  "k",
  "gs",
  "w",
  "J",
  "j",
  "M",
  "d",
  "ri",
  "i",
  "cs",
  "CS",
  "sc",
  "SC",
  "scn",
  "SCN",
  "Do",
  "sh",
  "Tr",
  "Ts",
  "Tc",
  "Tw",
  "Tz",
  "TL",
]);

interface SpanContext {
  readonly text: string;
  consumed: boolean;
}

function utf16beHexToString(hex: string): string {
  if (hex.length % 4 !== 0) {
    fail("ActualText hex is not whole UTF-16BE units");
  }
  return Buffer.from(hex, "hex").swap16().toString("utf16le");
}

/** 经当前字体 ToUnicode 正查解码十六进制串；缺码（洞）即 fail-closed。 */
function decodeHexText(hex: string, font: FontBinding): string {
  const unit = font.toUnicode.codeLength * 2;
  if (hex.length === 0 || hex.length % unit !== 0) {
    fail("hex string is not whole code units for the current font");
  }
  let text = "";
  for (let index = 0; index < hex.length; index += unit) {
    const code = Number.parseInt(hex.slice(index, index + unit), 16);
    const mapped = font.toUnicode.map.get(code);
    if (mapped === undefined) {
      fail("glyph code has no ToUnicode mapping on a toc page");
    }
    text += mapped;
  }
  return text;
}

/** 字面串解码：只收自家管线的无转义/简单转义形态，其余转义 fail-closed。 */
function decodeLiteralText(raw: string, font: FontBinding): string {
  if (/\\(?![()\\])/u.test(raw)) {
    fail("literal string uses an unsupported escape form");
  }
  const bytes = Buffer.from(raw.replace(/\\([()\\])/gu, "$1"), "latin1");
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return decodeHexText(hex, font);
}

/** 扫描单个内容流，产出有序 show 算子 token。只认自家管线形态。 */
export function scanContentStream(
  content: string,
  contentObjectId: number,
  fonts: ReadonlyMap<string, FontBinding>,
): readonly ShowToken[] {
  const tokens: ShowToken[] = [];
  const stack: (SpanContext | null)[] = [];
  let font: FontBinding | undefined;
  let operandStart: number | undefined;
  let cursor = 0;

  for (const lexeme of content.matchAll(LEXEME)) {
    const at = lexeme.index ?? 0;
    if (!/^\s*$/u.test(content.slice(cursor, at))) {
      fail("content stream has unrecognized bytes between lexemes");
    }
    cursor = at + lexeme[0].length;
    const raw = lexeme[0];
    const isOperand =
      raw.startsWith("/") ||
      raw.startsWith("<") ||
      raw === ">>" ||
      raw.startsWith("(") ||
      raw === "[" ||
      raw === "]" ||
      /^-?(?:\d+\.\d+|\.\d+|\d+)$/u.test(raw);
    if (isOperand) {
      operandStart ??= at;
      continue;
    }
    const operandRaw =
      operandStart === undefined ? "" : content.slice(operandStart, at);
    const operator = raw;
    if (operator === "Tf") {
      const matched = /^\/([A-Za-z0-9]+)\s+(-?[\d.]+)$/u.exec(operandRaw.trim());
      if (matched === null) {
        fail("Tf operands have an unrecognized form");
      }
      font = fonts.get(matched[1] ?? "");
      if (font === undefined) {
        fail("content stream selects a font not bound in page resources");
      }
    } else if (operator === "BDC") {
      const trimmed = operandRaw.trim();
      const span = /^\/Span\s*<<\s*\/ActualText\s*<([0-9A-Fa-f]+)>\s*>>$/u.exec(
        trimmed,
      );
      const mcid = /^\/[A-Za-z0-9]+\s*<<\s*\/MCID\s+\d+\s*>>$/u.exec(trimmed);
      if (span !== null) {
        // ActualText 内容去 FEFF（extract.ts 保留 BOM、归一化层剥离，这里直接取净）。
        const text = utf16beHexToString(span[1] ?? "").replace(/^\uFEFF/u, "");
        stack.push({ text, consumed: false });
      } else if (mcid !== null) {
        stack.push(null);
      } else {
        fail("BDC has an unrecognized operand form");
      }
    } else if (operator === "BMC") {
      if (!/^\/[A-Za-z0-9]+$/u.test(operandRaw.trim())) {
        fail("BMC has an unrecognized operand form");
      }
      stack.push(null);
    } else if (operator === "EMC") {
      const popped = stack.pop();
      if (popped === undefined) {
        fail("EMC without a matching BDC");
      }
      if (popped !== null && !popped.consumed) {
        // 与 extract.ts 一致：无字形 span 在 EMC 处仍发射 ActualText。
        tokens.push(
          Object.freeze({
            contentObjectId,
            start: at,
            end: at,
            fontObjectId: font?.fontObjectId ?? 0,
            text: popped.text,
            hex: null,
            viaActualText: true,
          }),
        );
      }
    } else if (operator === "Tj" || operator === "TJ") {
      const spanTop = stack.length > 0 ? stack[stack.length - 1] : undefined;
      const trimmedStart = operandStart ?? at;
      const start = trimmedStart + (operandRaw.length - operandRaw.trimStart().length);
      if (spanTop !== undefined && spanTop !== null) {
        if (!spanTop.consumed) {
          spanTop.consumed = true;
          tokens.push(
            Object.freeze({
              contentObjectId,
              start,
              end: cursor,
              fontObjectId: font?.fontObjectId ?? 0,
              text: spanTop.text,
              hex: null,
              viaActualText: true,
            }),
          );
        }
        // span 内后续字形被抑制（extract.ts 同口径），不产生字符。
      } else {
        if (font === undefined) {
          fail("show operator without a preceding Tf");
        }
        const operand = operandRaw.trim();
        let text = "";
        let hex: string | null = null;
        if (operator === "Tj") {
          if (/^<[0-9A-Fa-f]+>$/u.test(operand)) {
            hex = operand.slice(1, -1);
            text = decodeHexText(hex, font);
          } else if (/^\((?:[^()\\]|\\.)*\)$/u.test(operand)) {
            text = decodeLiteralText(operand.slice(1, -1), font);
          } else {
            fail("Tj has an unrecognized operand form");
          }
        } else {
          if (!/^\[[^\][]*\]$/u.test(operand)) {
            fail("TJ has an unrecognized operand form");
          }
          const body = operand.slice(1, -1).trim();
          let rest = body;
          while (rest.length > 0) {
            const piece =
              /^\s*(<([0-9A-Fa-f]+)>|\((?:[^()\\]|\\.)*\)|-?(?:\d+\.\d+|\.\d+|\d+))/u.exec(
                rest,
              );
            if (piece === null) {
              fail("TJ array has an unrecognized element");
            }
            if (piece[2] !== undefined) {
              text += decodeHexText(piece[2], font);
            } else if (piece[1] !== undefined && piece[1].startsWith("(")) {
              text += decodeLiteralText(piece[1].slice(1, -1), font);
            }
            rest = rest.slice(piece[0].length);
          }
        }
        tokens.push(
          Object.freeze({
            contentObjectId,
            start,
            end: cursor,
            fontObjectId: font.fontObjectId,
            text,
            hex,
            viaActualText: false,
          }),
        );
      }
    } else if (!PASSIVE_OPS.has(operator)) {
      fail(`content stream uses an unknown operator: ${operator}`);
    }
    operandStart = undefined;
  }
  if (!/^\s*$/u.test(content.slice(cursor))) {
    fail("content stream has trailing unrecognized bytes");
  }
  if (operandStart !== undefined) {
    fail("content stream ends with dangling operands");
  }
  if (stack.length > 0) {
    fail("content stream has unbalanced BDC/EMC");
  }
  return Object.freeze(tokens);
}
