import { TOC_HEADING, type TocEntry } from "@wenshu/document-model";

import { PdfExportError } from "./errors.ts";
import type { ToUnicodeMap } from "./extract.ts";
import { extractGeometry, type GeometryTextRun, type PdfGeometry } from "./geometry.ts";
import { inflate, parseObjects, parseToUnicode, type PdfObject } from "./inspect.ts";
import { buildIncrementalUpdate } from "./pdf-patch.ts";
import { normalizePdfText } from "./reconcile.ts";

/**
 * 目录页码字节级原地回填（决策 #21：占位符渲染 + 单遍渲染 + 原内容流改写）。
 * compose 期目录条目页码占位 span 已填成三个占位数字 8（`888`），本模块在
 * 大纲测量后把目录页内容流内的占位数字改写为实测页码：
 * - 前 n 个占位块的 Tj 十六进制码替换为目标数字在该字体 ToUnicode 反查的码
 *   （码长必须一致，不换字体）；
 * - 多余的占位块整段删除 `<…> Tj` 算子（BT/ET/Tf/Tm 空壳保留，BDC/EMC 不动，
 *   结构树 MCID 引用完好，提取侧无 run）。
 *
 * 纪律（与 pagination.ts 同款）：扫描器只认自家管线（Chromium/Skia）形态，
 * 未知构造、配对失配、反查歧义、几何漂移一律 fail-closed，绝不静默跳过。
 * 定位走「条目标题 → 紧随恰三个单字符 8 的 show 算子块」配对游标，禁裸搜
 * 字符串——正文天然含三连 8 的干扰组不会被触碰（配对游标在条目配齐后即停，
 * 正文页从不进入扫描）。
 */

function fail(message: string): never {
  throw new PdfExportError("PDF_EXPORT_BACKFILL_FAILED", message);
}

/** 占位组槽位数（三个占位数字 8）。 */
const PLACEHOLDER_SLOTS = 3;
/** 实测页码位数上限（corpus ≤30 页，契约上限 3 位）。 */
const MAX_PAGE_DIGITS = 3;

interface FontBinding {
  readonly fontObjectId: number;
  readonly toUnicode: ToUnicodeMap;
}

/** 一个 show 算子的扫描事实：解码文本、字节区间与字体归属。 */
interface ShowToken {
  readonly contentObjectId: number;
  /** show 算子在解压内容流内的起始（含字符串操作数，不含前导空白）。 */
  readonly start: number;
  /** show 算子结束（不含）。 */
  readonly end: number;
  readonly fontObjectId: number;
  /** 解码字符序列（ActualText 包内取 ActualText 内容、去 FEFF）。 */
  readonly text: string;
  /** `<hex> Tj` 形式的十六进制串；其他形式（literal/TJ/ActualText）为 null。 */
  readonly hex: string | null;
  readonly viaActualText: boolean;
}

/** 归一化后的单字符及其来源 token（tokenIndex 为页内扫描序全局下标）。 */
interface ScanChar {
  readonly char: string;
  readonly tokenIndex: number;
}

/** 配对成功的占位组。 */
interface PlaceholderGroup {
  readonly entryId: string;
  /** 实测页码字符串（1–3 位）。 */
  readonly pageText: string;
  /** 恰三个连续单字符 `8` 的 show 算子 token。 */
  readonly slots: readonly ShowToken[];
  /** 三个占位字符在全局扫描字符序列中的位置（终验 run 映射用）。 */
  readonly charPositions: readonly number[];
}

// ---------------------------------------------------------------------------
// 内容流轻量扫描器（有序，不是 geometry-text 复用——签署路径零改动）
// ---------------------------------------------------------------------------

/**
 * 词法：字典括号/数组括号/名字/十六进制串/字面串/数字先匹配，余者归为算子
 * （未知算子在分派时 fail-closed）。词素间隙只允许空白，否则流形态未知。
 */
const LEXEME =
  /<<|>>|\[|\]|\/[^\s/<>\[\]()]+|<[0-9A-Fa-f]+>|\((?:[^()\\]|\\.)*\)|-?(?:\d+\.\d+|\.\d+|\d+)|[^\s/<>\[\]()]+/gu;

/** 图形与文本状态白名单算子：识别但不产生字符。其余算子一律 fail-closed。 */
const PASSIVE_OPS: ReadonlySet<string> = new Set([
  "BT", "ET", "Tm", "Td", "TD", "T*", "cm", "q", "Q", "MP", "BX", "EX",
  "re", "m", "l", "c", "v", "y", "h", "f", "F", "f*", "S", "s", "B", "B*",
  "b", "b*", "n", "W", "W*", "RG", "rg", "G", "g", "K", "k", "gs", "w", "J",
  "j", "M", "d", "ri", "i", "cs", "CS", "sc", "SC", "scn", "SCN", "Do", "sh",
  "Tr", "Ts", "Tc", "Tw", "Tz", "TL",
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
function scanContentStream(
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
    const operandRaw = operandStart === undefined ? "" : content.slice(operandStart, at);
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
      const span = /^\/Span\s*<<\s*\/ActualText\s*<([0-9A-Fa-f]+)>\s*>>$/u.exec(trimmed);
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
          if (!/^\[[^\]\[]*\]$/u.test(operand)) {
            fail("TJ has an unrecognized operand form");
          }
          const body = operand.slice(1, -1).trim();
          let rest = body;
          while (rest.length > 0) {
            const piece = /^\s*(<([0-9A-Fa-f]+)>|\((?:[^()\\]|\\.)*\)|-?(?:\d+\.\d+|\.\d+|\d+))/u.exec(rest);
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

// ---------------------------------------------------------------------------
// 页装配：资源字体绑定、逐页扫描、与签署提取的交叉校验
// ---------------------------------------------------------------------------

interface ScannedPage {
  readonly pageIndex: number;
  /** 本页字符在全局扫描字符序列中的起始。 */
  readonly charStart: number;
  readonly charCount: number;
}

/** 页资源字典的 `/Tag id 0 R` 字体绑定（沿用 inspect/geometry 的整词口径）。 */
function pageFontBindings(
  objects: ReadonlyMap<number, PdfObject>,
  pageDict: PdfObject,
): Map<string, FontBinding> {
  const fontObjectIds = new Set<number>();
  for (const [id, object] of objects) {
    if (/\/Type\s*\/Font\b/.test(object.dict)) {
      fontObjectIds.add(id);
    }
  }
  const bindings = new Map<string, FontBinding>();
  for (const match of pageDict.dict.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
    const refId = Number(match[2]);
    const tag = match[1] ?? "";
    if (!fontObjectIds.has(refId)) {
      continue;
    }
    const fontObject = objects.get(refId);
    const toUnicodeRef = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(fontObject?.dict ?? "")?.[1];
    const toUnicodeObject =
      toUnicodeRef === undefined ? undefined : objects.get(Number(toUnicodeRef));
    if (toUnicodeObject === undefined) {
      fail("a font on a toc page has no ToUnicode cmap");
    }
    bindings.set(
      tag,
      Object.freeze({
        fontObjectId: refId,
        toUnicode: parseToUnicode(inflate(toUnicodeObject, "tounicode")),
      }),
    );
  }
  return bindings;
}

function pageContentIds(pageDict: PdfObject): readonly number[] {
  const matches = [
    ...pageDict.dict.matchAll(
      /\/Contents\s+(?:(\d+)\s+0\s+R|\[((?:\s*\d+\s+0\s+R)*)\s*\])/g,
    ),
  ];
  const ids: number[] = [];
  for (const match of matches) {
    if (match[1] !== undefined) {
      ids.push(Number(match[1]));
    } else {
      for (const ref of (match[2] ?? "").matchAll(/(\d+)\s+0\s+R/g)) {
        ids.push(Number(ref[1]));
      }
    }
  }
  if (ids.length === 0) {
    fail("page without a Contents reference");
  }
  return Object.freeze(ids);
}

/** 提取侧逐页归一化字符（逐字归一 + run 归属），与扫描字符序列同构。 */
interface ExtractionChar {
  readonly char: string;
  readonly runIndex: number;
}

function normalizeChar(char: string): string {
  const normalized = normalizePdfText(char);
  if (normalized === "") {
    return "";
  }
  if ([...normalized].length !== 1) {
    fail("a character normalizes to a multi-char form (unknown pipeline form)");
  }
  return normalized;
}

function flattenExtractionPage(
  geometry: PdfGeometry,
  pageIndex: number,
): ExtractionChar[] {
  const chars: ExtractionChar[] = [];
  geometry.textRuns.forEach((run, runIndex) => {
    if (run.pageIndex !== pageIndex) {
      return;
    }
    for (const char of run.text) {
      const normalized = normalizeChar(char);
      if (normalized !== "") {
        chars.push({ char: normalized, runIndex });
      }
    }
  });
  return chars;
}

/** 扫描 token 序列 → 归一化字符序列（token 归属保留）。 */
function flattenTokens(tokens: readonly ShowToken[], tokenOffset: number): ScanChar[] {
  const chars: ScanChar[] = [];
  tokens.forEach((token, index) => {
    for (const char of token.text) {
      const normalized = normalizeChar(char);
      if (normalized !== "") {
        chars.push({ char: normalized, tokenIndex: tokenOffset + index });
      }
    }
  });
  return chars;
}

// ---------------------------------------------------------------------------
// 几何终验：回填前后除被替换/删除的数字 run 外逐一全等（决策 #21 首关口）
// ---------------------------------------------------------------------------

function runsEqual(a: GeometryTextRun, b: GeometryTextRun): boolean {
  return (
    a.pageIndex === b.pageIndex &&
    a.text === b.text &&
    a.baselineY === b.baselineY &&
    a.fontSize === b.fontSize &&
    a.font.tag === b.font.tag &&
    a.font.objectId === b.font.objectId &&
    a.bbox.x === b.bbox.x &&
    a.bbox.y === b.bbox.y &&
    a.bbox.width === b.bbox.width &&
    a.bbox.height === b.bbox.height
  );
}

function assertSameGeometry(before: PdfGeometry, after: PdfGeometry): void {
  if (before.pages.length !== after.pages.length) {
    fail("backfill changed the page count");
  }
  for (let index = 0; index < before.pages.length; index += 1) {
    const a = before.pages[index];
    const b = after.pages[index];
    if (
      a === undefined ||
      b === undefined ||
      a.index !== b.index ||
      a.rotate !== b.rotate ||
      a.mediaBox.length !== b.mediaBox.length ||
      a.mediaBox.some((value, i) => value !== b.mediaBox[i])
    ) {
      fail("backfill changed a page box or rotation");
    }
  }
  if (before.figures.length !== after.figures.length) {
    fail("backfill changed the figure count");
  }
  for (let index = 0; index < before.figures.length; index += 1) {
    const a = before.figures[index];
    const b = after.figures[index];
    if (
      a === undefined ||
      b === undefined ||
      a.pageIndex !== b.pageIndex ||
      a.mcid !== b.mcid ||
      a.altShort !== b.altShort ||
      a.altLong !== b.altLong ||
      a.bbox.x !== b.bbox.x ||
      a.bbox.y !== b.bbox.y ||
      a.bbox.width !== b.bbox.width ||
      a.bbox.height !== b.bbox.height ||
      a.paintBBox.x !== b.paintBBox.x ||
      a.paintBBox.y !== b.paintBBox.y ||
      a.paintBBox.width !== b.paintBBox.width ||
      a.paintBBox.height !== b.paintBBox.height
    ) {
      fail("backfill changed a figure span");
    }
  }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 把占位渲染产物（目录页码为 888）原地回填为实测页码。
 * 返回增量更新后的 PDF：原字节前缀逐字节不变。
 */
export function backfillTocPageNumbers(
  original: Uint8Array,
  entries: readonly TocEntry[],
  tocPages: ReadonlyMap<string, number>,
): Uint8Array {
  if (entries.length === 0) {
    fail("no toc entries");
  }
  // 页码表先行校验：缺条目、非整数、超 1–3 位范围一律 fail-closed。
  const pageTextByEntry = new Map<string, string>();
  for (const entry of entries) {
    const page = tocPages.get(entry.id);
    if (page === undefined) {
      fail("toc entry lacks a measured page number");
    }
    if (!Number.isInteger(page) || page < 1 || page > 10 ** MAX_PAGE_DIGITS - 1) {
      fail("toc page number is outside the supported 1-3 digit range");
    }
    pageTextByEntry.set(entry.id, String(page));
  }

  const objects = parseObjects(original);
  const pageEntries = [...objects.entries()].filter(
    ([, object]) =>
      /\/Type\s*\/Page\b/.test(object.dict) && !/\/Type\s*\/Pages\b/.test(object.dict),
  );
  if (pageEntries.length === 0) {
    fail("no pages found");
  }
  const before = extractGeometry(original);
  // 提取侧字符惰性逐页扁平化：只处理进入扫描/终验的目录页——正文页永不
  // 扁平化（其字符形态不在本模块职责内，避免误伤）。
  const extractionCache = new Map<number, ExtractionChar[]>();
  const extractionChars = (pageIndex: number): ExtractionChar[] => {
    const cached = extractionCache.get(pageIndex);
    if (cached !== undefined) {
      return cached;
    }
    const chars = flattenExtractionPage(before, pageIndex);
    extractionCache.set(pageIndex, chars);
    return chars;
  };
  const heading = normalizePdfText(TOC_HEADING);
  const tocStart = before.pages.findIndex((page) =>
    extractionChars(page.index)
      .map((char) => char.char)
      .join("")
      .startsWith(heading),
  );
  if (tocStart === -1) {
    fail("toc heading page not found");
  }

  // 惰性逐页扫描：从目录首页起，条目配齐即停（正文页从不进入扫描）。
  const allTokens: ShowToken[] = [];
  const allChars: ScanChar[] = [];
  const contentTexts = new Map<number, string>();
  const bindingsByFontId = new Map<number, FontBinding>();
  const scannedPages: ScannedPage[] = [];
  let scannedUpTo = tocStart - 1;
  const scanNextPage = (): void => {
    scannedUpTo += 1;
    const pageEntry = pageEntries[scannedUpTo];
    if (pageEntry === undefined) {
      fail("toc entries ran past the last page");
    }
    const [, pageDict] = pageEntry;
    const bindings = pageFontBindings(objects, pageDict);
    for (const binding of bindings.values()) {
      bindingsByFontId.set(binding.fontObjectId, binding);
    }
    const charStart = allChars.length;
    for (const contentId of pageContentIds(pageDict)) {
      const contentObject = objects.get(contentId);
      if (contentObject === undefined) {
        fail("page content object is missing");
      }
      const content =
        contentTexts.get(contentId) ?? inflate(contentObject, "page content");
      contentTexts.set(contentId, content);
      const tokens = scanContentStream(content, contentId, bindings);
      allChars.push(...flattenTokens(tokens, allTokens.length));
      allTokens.push(...tokens);
    }
    scannedPages.push(
      Object.freeze({
        pageIndex: scannedUpTo,
        charStart,
        charCount: allChars.length - charStart,
      }),
    );
    // 交叉校验：扫描字符序列必须与签署提取（extractGeometry）逐字相等——
    // 防扫描器与提取语义分叉。不等即 fail-closed，不猜哪侧为真。
    const extracted = extractionChars(scannedUpTo);
    if (extracted === undefined || extracted.length !== allChars.length - charStart) {
      fail("scanner/extraction cross-check failed (length)");
    }
    for (let index = 0; index < extracted.length; index += 1) {
      if (extracted[index]?.char !== allChars[charStart + index]?.char) {
        fail("scanner/extraction cross-check failed (character)");
      }
    }
  };
  scanNextPage();

  // 配对游标：条目按序，标题字符序列从上次位置向后匹配；标题末字之后
  // 必须紧随恰三个连续单字符 `8` 的 `<hex> Tj` 块（占位组）。
  const groups: PlaceholderGroup[] = [];
  let cursor = 0;
  for (const entry of entries) {
    const titleChars = [...normalizePdfText(entry.title)];
    if (titleChars.length === 0) {
      fail("toc entry title normalizes to empty");
    }
    for (;;) {
      let at = -1;
      for (let index = cursor; index + titleChars.length <= allChars.length; index += 1) {
        if (titleChars.every((char, offset) => allChars[index + offset]?.char === char)) {
          at = index;
          break;
        }
      }
      if (at !== -1 && at + titleChars.length + PLACEHOLDER_SLOTS <= allChars.length) {
        const titleEnd = at + titleChars.length;
        const slots: ShowToken[] = [];
        const charPositions: number[] = [];
        for (let slot = 0; slot < PLACEHOLDER_SLOTS; slot += 1) {
          const scanChar = allChars[titleEnd + slot];
          const token =
            scanChar === undefined ? undefined : allTokens[scanChar.tokenIndex];
          if (
            scanChar === undefined ||
            token === undefined ||
            scanChar.char !== "8" ||
            token.text !== "8" ||
            token.hex === null ||
            token.viaActualText
          ) {
            fail("toc entry is not followed by exactly three single-char 8 shows");
          }
          slots.push(token);
          charPositions.push(titleEnd + slot);
        }
        const firstSlotToken = allChars[titleEnd]?.tokenIndex ?? -1;
        const lastTitleToken = allChars[titleEnd - 1]?.tokenIndex ?? -1;
        const consecutive =
          firstSlotToken === lastTitleToken + 1 &&
          slots.every(
            (token, slot) => allTokens.indexOf(token) === firstSlotToken + slot,
          );
        if (!consecutive) {
          fail("placeholder slots are not three consecutive show operators");
        }
        groups.push(
          Object.freeze({
            entryId: entry.id,
            pageText: pageTextByEntry.get(entry.id) ?? "",
            slots: Object.freeze(slots),
            charPositions: Object.freeze(charPositions),
          }),
        );
        cursor = titleEnd + PLACEHOLDER_SLOTS;
        break;
      }
      if (scannedUpTo + 1 >= pageEntries.length) {
        fail("toc entry has no matching placeholder group (document order cursor)");
      }
      scanNextPage();
    }
  }

  // 改写：前 n 个槽替换十六进制码（同字体 ToUnicode 反查、码长一致）；
  // 多余槽整段删除 `<…> Tj` 算子。编辑按字节区间从后往前应用。
  const reverseLookup = (token: ShowToken, digit: string): string => {
    const binding = bindingsByFontId.get(token.fontObjectId);
    if (binding === undefined) {
      fail("placeholder font binding is missing");
    }
    const codes: number[] = [];
    for (const [code, mapped] of binding.toUnicode.map) {
      if (mapped === digit) {
        codes.push(code);
      }
    }
    if (codes.length === 0) {
      fail("digit has no code in the placeholder font ToUnicode");
    }
    if (codes.length > 1) {
      fail("digit maps to multiple codes (ambiguous reverse lookup)");
    }
    const hex = (codes[0] ?? 0)
      .toString(16)
      .toUpperCase()
      .padStart(binding.toUnicode.codeLength * 2, "0");
    if (hex.length !== token.hex?.length) {
      fail("replacement code length differs from the placeholder code length");
    }
    return hex;
  };
  const editsByObject = new Map<number, { start: number; end: number; text: string }[]>();
  for (const group of groups) {
    for (let slot = 0; slot < PLACEHOLDER_SLOTS; slot += 1) {
      const token = group.slots[slot];
      if (token === undefined || token.hex === null) {
        fail("placeholder slot lost its hex payload");
      }
      const edits = editsByObject.get(token.contentObjectId) ?? [];
      if (slot < group.pageText.length) {
        edits.push({
          start: token.start + 1,
          end: token.start + 1 + token.hex.length,
          text: reverseLookup(token, group.pageText[slot] ?? ""),
        });
      } else {
        edits.push({ start: token.start, end: token.end, text: "" });
      }
      editsByObject.set(token.contentObjectId, edits);
    }
  }
  const streamRewrites = new Map<number, string>();
  for (const [objectId, edits] of editsByObject) {
    let text = contentTexts.get(objectId) ?? "";
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    }
    streamRewrites.set(objectId, text);
  }
  const backfilled = buildIncrementalUpdate(original, streamRewrites);
  if (
    !Buffer.from(backfilled).subarray(0, original.length).equals(Buffer.from(original))
  ) {
    fail("incremental update altered the original byte prefix");
  }

  // 终验（自核验 fail-closed）：
  // ① 目录页每条目标题后字符 === 实测页码字符串（重跑提取 + 重跑配对）；
  // ② 几何全等：除被替换/删除的数字 run 外，全部页全部 run 逐一相等。
  const after = extractGeometry(backfilled);
  assertSameGeometry(before, after);

  // 占位字符 → 回填前 run 映射（交叉校验已保证扫描字符与提取字符逐位对齐）。
  const pageOfChar = (position: number): ScannedPage => {
    const page = scannedPages.find(
      (scanned) =>
        position >= scanned.charStart && position < scanned.charStart + scanned.charCount,
    );
    if (page === undefined) {
      fail("placeholder char position has no scanned page");
    }
    return page;
  };
  const replacedDigits = new Map<number, string>();
  const deletedRuns = new Set<number>();
  for (const group of groups) {
    const slotRuns: number[] = [];
    for (const position of group.charPositions) {
      const page = pageOfChar(position);
      const extractionChar = extractionChars(page.pageIndex)[position - page.charStart];
      if (extractionChar === undefined) {
        fail("placeholder char has no extraction counterpart");
      }
      slotRuns.push(extractionChar.runIndex);
    }
    if (new Set(slotRuns).size !== PLACEHOLDER_SLOTS) {
      fail("placeholder slots do not map to three distinct runs");
    }
    for (let slot = 0; slot < PLACEHOLDER_SLOTS; slot += 1) {
      const run = before.textRuns[slotRuns[slot] ?? -1];
      if (run === undefined || run.text !== "8") {
        fail("placeholder slot does not map to a single-char 8 run");
      }
      if (slot < group.pageText.length) {
        replacedDigits.set(slotRuns[slot] ?? -1, group.pageText[slot] ?? "");
      } else {
        deletedRuns.add(slotRuns[slot] ?? -1);
      }
    }
  }
  if (after.textRuns.length !== before.textRuns.length - deletedRuns.size) {
    fail("backfill changed the run count beyond the deleted placeholder slots");
  }
  let afterIndex = 0;
  for (let index = 0; index < before.textRuns.length; index += 1) {
    const beforeRun = before.textRuns[index];
    if (beforeRun === undefined || deletedRuns.has(index)) {
      continue;
    }
    const afterRun = after.textRuns[afterIndex];
    afterIndex += 1;
    if (afterRun === undefined) {
      fail("backfill lost a text run");
    }
    const digit = replacedDigits.get(index);
    if (digit !== undefined) {
      // 被替换的数字 run：文本必须变为目标数字；Tm/Td 未动、字体/字号不变，
      // 故页/字体/字号/基线/bbox.x/bbox.y/bbox.height 全部钉定，仅豁免
      // bbox.width（数字字形宽度可不同）。
      if (
        afterRun.text !== digit ||
        afterRun.pageIndex !== beforeRun.pageIndex ||
        afterRun.font.tag !== beforeRun.font.tag ||
        afterRun.font.objectId !== beforeRun.font.objectId ||
        afterRun.fontSize !== beforeRun.fontSize ||
        afterRun.baselineY !== beforeRun.baselineY ||
        afterRun.bbox.x !== beforeRun.bbox.x ||
        afterRun.bbox.y !== beforeRun.bbox.y ||
        afterRun.bbox.height !== beforeRun.bbox.height
      ) {
        fail("a replaced digit run drifted beyond its text and width");
      }
    } else if (!runsEqual(beforeRun, afterRun)) {
      fail("backfill altered a run outside the placeholder digits");
    }
  }

  // ① 目录页标题后字符 === 实测页码字符串（只覆盖配对消耗的目录页范围，
  // 正文页不参与逐字断言——其完整性由上面的几何全等门独立保证）。
  const afterChars: string[] = [];
  for (let page = tocStart; page <= scannedUpTo; page += 1) {
    for (const char of flattenExtractionPage(after, page)) {
      afterChars.push(char.char);
    }
  }
  let verifyCursor = 0;
  for (const entry of entries) {
    const titleChars = [...normalizePdfText(entry.title)];
    const pageText = pageTextByEntry.get(entry.id) ?? "";
    let at = -1;
    for (
      let index = verifyCursor;
      index + titleChars.length <= afterChars.length;
      index += 1
    ) {
      if (titleChars.every((char, offset) => afterChars[index + offset] === char)) {
        at = index;
        break;
      }
    }
    if (at === -1) {
      fail("backfilled pdf lost a toc entry title");
    }
    const digitsAt = at + titleChars.length;
    for (let offset = 0; offset < pageText.length; offset += 1) {
      if (afterChars[digitsAt + offset] !== pageText[offset]) {
        fail("backfilled toc page number does not match the measured page");
      }
    }
    verifyCursor = digitsAt + pageText.length;
  }

  return backfilled;
}
