import { deflateSync } from "node:zlib";

import { PdfExportError } from "./errors.ts";
import { extractGeometry } from "./geometry.ts";
import { inflate, inspectPdf, parseObjects, parseToUnicode } from "./inspect.ts";
import { normalizePdfText } from "./reconcile.ts";

/**
 * 页眉页脚 PDF 层压印（PA-11A 受控补偿，ADR-0010）：Chromium 不支持
 * @page 页边盒与 target-counter（能力触顶已书面登记），页眉 short_title
 * 与页脚「N / total」由本模块在打印产物上以增量更新压印。
 * 受控性来源：
 * - 字形表示逐字复刻引擎自身产物：优先复用已内嵌子集字体 ToUnicode
 *   单字符映射（部首码位视同归一后等价）；无单字符映射的字（如「文」）
 *   复刻检查器 origins 记录的引擎原始（字体对象, 字形码, ActualText）
 *   表示——画的是同一字形，文本层标注与引擎一致，绝不虚构字形；
 * - 位置钉在模板上边距/下边距带内（公式唯一，不逐页写死）；
 * - 压印带与既有内容包围盒零交叠（几何自检，交叠即失败）；
 * - 封面（物理第 1 页）豁免；
 * - 压印后重新提取：逐页剥离压印串再逐字对账（位置锚定，非计数猜测）。
 */

/** 压印字号（pt）：模板无页眉页脚 token，补偿层钉定常量（ADR-0010）。 */
export const STAMP_FONT_SIZE = 9;

export interface StampSpec {
  /** 页眉文本（front matter short_title）。 */
  readonly headerText: string;
  readonly pageWidthPt: number;
  readonly pageHeightPt: number;
  readonly marginTopPt: number;
  readonly marginBottomPt: number;
  readonly marginLeftPt: number;
}

function failStamp(message: string): never {
  throw new PdfExportError("PDF_EXPORT_STAMP_FAILED", message);
}

interface PageEntry {
  readonly objectId: number;
  readonly dict: string;
}

function listPages(
  objects: Map<number, { readonly dict: string }>,
): readonly PageEntry[] {
  return [...objects.entries()]
    .filter(
      ([, object]) =>
        /\/Type\s*\/Page\b/.test(object.dict) && !/\/Type\s*\/Pages\b/.test(object.dict),
    )
    .map(([objectId, object]) => Object.freeze({ objectId, dict: object.dict }));
}

/** 单字符表示：普通 Tj 或 ActualText 复刻（引擎原表示）。 */
interface CharRep {
  readonly fontObjectId: number;
  readonly code: number;
  readonly codeLength: number;
  /** 需要 ActualText 包装时的标注字符（无单字符 ToUnicode 映射的引擎原表示）。 */
  readonly actualText: string | null;
}

/**
 * 逐字解析压印字符的复刻表示：
 * A. 子集字体 ToUnicode 单字符映射（归一等价：部首码位 NFKC 归位后同字即可）；
 * B. 检查器 origins 的引擎原表示（同字体同码，ActualText 单字来源）；
 * 两路均无即 fail-closed（宁缺印，不虚构）。
 */
export function resolveStampReps(
  bytes: Uint8Array,
  chars: readonly string[],
): ReadonlyMap<string, CharRep> {
  const objects = parseObjects(bytes);
  const wanted = new Set(chars);
  const reps = new Map<string, CharRep>();
  // A 路：字体对象号升序保证确定性。
  for (const [fontObjectId, object] of [...objects.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    if (!/\/Type\s*\/Font\b/.test(object.dict)) {
      continue;
    }
    const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(object.dict)?.[1];
    const toUnicodeObject = ref === undefined ? undefined : objects.get(Number(ref));
    if (toUnicodeObject === undefined) {
      continue;
    }
    const cmap = parseToUnicode(inflate(toUnicodeObject, "stamp tounicode"));
    for (const [code, value] of [...cmap.map.entries()].sort((a, b) => a[0] - b[0])) {
      if ([...value].length !== 1) {
        continue;
      }
      for (const char of wanted) {
        if (reps.has(char)) {
          continue;
        }
        if (value === char || normalizePdfText(value) === normalizePdfText(char)) {
          reps.set(
            char,
            Object.freeze({
              fontObjectId,
              code,
              codeLength: cmap.codeLength,
              actualText: null,
            }),
          );
        }
      }
    }
  }
  // B 路：origins 复刻（仅补 A 路缺口）。
  const missing = [...wanted].filter((char) => !reps.has(char));
  if (missing.length > 0) {
    const inspection = inspectPdf(bytes);
    const fullText = inspection.pages.map((page) => page.text).join("");
    const chars = [...fullText];
    for (const char of missing) {
      for (let index = 0; index < chars.length; index += 1) {
        if (chars[index] !== char) {
          continue;
        }
        const origin = inspection.origins[index];
        if (origin === null || origin === undefined || !origin.viaActualText) {
          continue;
        }
        const font = objects.get(origin.fontObjectId);
        const ref =
          font === undefined
            ? undefined
            : /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font.dict)?.[1];
        const toUnicodeObject =
          ref === undefined ? undefined : objects.get(Number(ref));
        // 码长取该字体 codespace（无 ToUnicode 时按 Skia 惯例 2 字节，下方守卫再验）。
        const codeLength =
          toUnicodeObject === undefined
            ? 2
            : parseToUnicode(inflate(toUnicodeObject, "stamp tounicode")).codeLength;
        reps.set(
          char,
          Object.freeze({
            fontObjectId: origin.fontObjectId,
            code: origin.code,
            codeLength,
            actualText: char,
          }),
        );
        break;
      }
      if (!reps.has(char)) {
        failStamp("stamp character has no faithful glyph representation");
      }
    }
  }
  return reps;
}

/** 压印带与既有内容的零交叠自检（几何事实，非阈值发明）。 */
function assertStampBandsClear(
  bytes: Uint8Array,
  spec: StampSpec,
  pageCount: number,
): void {
  const geometry = extractGeometry(bytes);
  if (geometry.pages.length !== pageCount) {
    failStamp("geometry page count drifted during stamping");
  }
  const headerBottom = spec.pageHeightPt - spec.marginTopPt;
  for (const run of geometry.textRuns) {
    if (run.pageIndex === 0) {
      continue;
    }
    const runTop = run.bbox.y;
    const runBottom = run.bbox.y - run.bbox.height;
    const hitsHeader = runBottom < spec.pageHeightPt && runTop > headerBottom;
    const hitsFooter = runTop > 0 && runBottom < spec.marginBottomPt;
    if (hitsHeader || hitsFooter) {
      failStamp(
        `stamp band overlaps existing content on page ${run.pageIndex + 1} (band ${
          hitsHeader ? "header" : "footer"
        })`,
      );
    }
  }
}

interface StampAddition {
  readonly objectId: number;
  readonly body: string;
}

/** 增量更新写出（压印专用）：新内容流对象 + 页字典重写（/Contents 追加 + /Font 增补）。 */
function buildStampUpdate(
  original: Uint8Array,
  additions: readonly StampAddition[],
): Uint8Array {
  const text = Buffer.from(original).toString("latin1");
  const prevStart = /startxref\s+(\d+)\s*%%EOF\s*$/u.exec(text)?.[1];
  if (prevStart === undefined) {
    failStamp("original pdf lacks startxref");
  }
  const trailerMatch = /trailer\s*<<([\s\S]*?)>>\s*startxref/u.exec(text);
  const rootRef = /\/Root\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  const infoRef = /\/Info\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  if (rootRef === undefined) {
    failStamp("original trailer lacks /Root");
  }

  const sorted = [...additions].sort((a, b) => a.objectId - b.objectId);
  const parts: string[] = [];
  const offsets = new Map<number, number>();
  let cursor = original.length;
  for (const addition of sorted) {
    const chunk = `${addition.objectId} 0 obj\n${addition.body}\nendobj\n`;
    offsets.set(addition.objectId, cursor);
    parts.push(chunk);
    cursor += Buffer.byteLength(chunk, "latin1");
  }
  const xrefStart = cursor;
  const xrefLines: string[] = [];
  let index = 0;
  while (index < sorted.length) {
    const startId = sorted[index]?.objectId ?? 0;
    let end = index;
    while (
      end + 1 < sorted.length &&
      (sorted[end + 1]?.objectId ?? 0) === (sorted[end]?.objectId ?? 0) + 1
    ) {
      end += 1;
    }
    const entries = sorted
      .slice(index, end + 1)
      .map(
        (addition) =>
          `${(offsets.get(addition.objectId) ?? 0).toString().padStart(10, "0")} 00000 n \n`,
      )
      .join("");
    xrefLines.push(`${startId} ${end - index + 1}\n${entries}`);
    index = end + 1;
  }
  const existingMax = [...parseObjects(original).keys()].reduce(
    (max, id) => Math.max(max, id),
    0,
  );
  const maxId = Math.max(existingMax, sorted[sorted.length - 1]?.objectId ?? 0);
  const trailer =
    `trailer\n<</Size ${maxId + 1} /Root ${rootRef}` +
    (infoRef === undefined ? "" : ` /Info ${infoRef}`) +
    ` /Prev ${prevStart}>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const update = `${parts.join("")}xref\n${xrefLines.join("")}${trailer}`;
  const out = new Uint8Array(original.length + Buffer.byteLength(update, "latin1"));
  out.set(original, 0);
  out.set(Buffer.from(update, "latin1"), original.length);
  return out;
}

function encodeChar(rep: CharRep): string {
  return rep.code.toString(16).toUpperCase().padStart(rep.codeLength * 2, "0");
}

function actualTextHex(char: string): string {
  return `FEFF${[...char]
    .map((part) => (part.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"))
    .join("")}`;
}

/** 一行压印内容：逐字 Tf 切换 + 必要时 ActualText 包装（字形推进由字体宽度表完成）。 */
function stampLine(
  text: string,
  reps: ReadonlyMap<string, CharRep>,
  tags: ReadonlyMap<number, string>,
  x: number,
  y: number,
): string {
  const segments: string[] = [];
  let firstTag: string | undefined;
  for (const char of text) {
    const rep = reps.get(char);
    if (rep === undefined) {
      failStamp("stamp line contains an unresolved character");
    }
    const tag = tags.get(rep.fontObjectId);
    if (tag === undefined) {
      failStamp("stamp font is not registered on the page");
    }
    firstTag ??= tag;
    const show = `/${tag} ${STAMP_FONT_SIZE} Tf <${encodeChar(rep)}> Tj`;
    segments.push(
      rep.actualText === null
        ? show
        : `/Span <</ActualText <${actualTextHex(rep.actualText)}>>> BDC ${show} EMC`,
    );
  }
  // Tf 先于 Tm：几何解析器要求 Tm 落点时已激活字体（与 Skia 自身流序一致）。
  return `BT 0 g /${firstTag ?? ""} ${STAMP_FONT_SIZE} Tf 1 0 0 1 ${x} ${y.toFixed(2)} Tm ${segments.join(" ")} ET`;
}

/**
 * 压印页眉页脚：封面（物理页 1）豁免，其余页压 页眉 short_title + 页脚 N / total。
 * 失败码 PDF_EXPORT_STAMP_FAILED；任何前提不满足即拒绝产出。
 */
export function stampRunningHeaders(bytes: Uint8Array, spec: StampSpec): Uint8Array {
  if (spec.headerText.length === 0) {
    failStamp("header text (short_title) is required for stamping");
  }
  const objects = parseObjects(bytes);
  const pages = listPages(objects);
  if (pages.length < 2) {
    failStamp("document has no content pages to stamp");
  }
  const pageCount = pages.length;
  const footerLast = `${pageCount} / ${pageCount}`;
  const stampChars = [
    ...new Set([...spec.headerText, ...footerLast, ..."0123456789/ "]),
  ];
  const reps = resolveStampReps(bytes, stampChars);

  // 压印带零交叠自检先于任何字节改写。
  assertStampBandsClear(bytes, spec, pageCount);

  // 所用字体统一登记到每个非封面页的 /Font 资源（确定性 tag，冲突即失败）。
  const fontIds = [...new Set([...reps.values()].map((rep) => rep.fontObjectId))].sort(
    (a, b) => a - b,
  );
  const tags = new Map<number, string>(
    fontIds.map((id, index) => [id, `PA11F${index + 1}`]),
  );
  const fontEntries = fontIds
    .map((id) => `/${tags.get(id) ?? ""} ${id} 0 R`)
    .join("");

  const existingMax = [...objects.keys()].reduce((max, id) => Math.max(max, id), 0);
  const additions: StampAddition[] = [];
  let nextId = existingMax;
  for (const [pageIndex, page] of pages.entries()) {
    if (pageIndex === 0) {
      continue;
    }
    for (const tag of tags.values()) {
      if (page.dict.includes(`/${tag}`)) {
        failStamp("stamp font tag collides with an existing resource tag");
      }
    }
    nextId += 1;
    const headerBaseline =
      spec.pageHeightPt - spec.marginTopPt / 2 - STAMP_FONT_SIZE * 0.35;
    const footerBaseline = spec.marginBottomPt / 2 - STAMP_FONT_SIZE * 0.35;
    const streamText = `q\n${stampLine(
      spec.headerText,
      reps,
      tags,
      spec.marginLeftPt,
      headerBaseline,
    )}\n${stampLine(
      `${pageIndex + 1} / ${pageCount}`,
      reps,
      tags,
      spec.marginLeftPt,
      footerBaseline,
    )}\nQ\n`;
    const compressed = deflateSync(Buffer.from(streamText, "latin1"));
    additions.push(
      Object.freeze({
        objectId: nextId,
        body:
          `<</Length ${compressed.length} /Filter /FlateDecode>>\nstream\n` +
          compressed.toString("latin1") +
          "\nendstream",
      }),
    );

    const fontDict = /\/Font\s*<<([\s\S]*?)>>/u.exec(page.dict);
    if (fontDict === null || fontDict.index === undefined) {
      failStamp(`page ${pageIndex + 1} lacks an inline font resource dict`);
    }
    let newDict = `${page.dict.slice(0, fontDict.index)}/Font <<${
      fontDict[1] ?? ""
    }${fontEntries}>>${page.dict.slice(fontDict.index + fontDict[0].length)}`;
    const contentsArray = /\/Contents\s*\[((?:\s*\d+\s+0\s+R)*)\s*\]/u.exec(newDict);
    const contentsSingle = /\/Contents\s+(\d+)\s+0\s+R/u.exec(newDict);
    if (contentsArray !== null) {
      newDict = newDict.replace(
        contentsArray[0],
        `/Contents [${contentsArray[1] ?? ""} ${nextId} 0 R ]`,
      );
    } else if (contentsSingle !== null) {
      newDict = newDict.replace(
        contentsSingle[0],
        `/Contents [${contentsSingle[1] ?? ""} 0 R ${nextId} 0 R]`,
      );
    } else {
      failStamp(`page ${pageIndex + 1} lacks a contents entry`);
    }
    additions.push(Object.freeze({ objectId: page.objectId, body: newDict.trim() }));
  }
  return buildStampUpdate(bytes, additions);
}

/**
 * 压印核验（对账承接）：逐页确认页眉+页脚串以提取序后缀精确出现（归一口径，
 * 部首码位/ActualText 与引擎一致），位置锚定剥离后返回拼接文本供逐字对账。
 */
export function stripStampsForReconcile(
  pageTexts: readonly string[],
  spec: StampSpec,
): string {
  const parts: string[] = [];
  const pageCount = pageTexts.length;
  for (const [pageIndex, text] of pageTexts.entries()) {
    if (pageIndex === 0) {
      parts.push(text);
      continue;
    }
    const suffix = `${spec.headerText}${pageIndex + 1} / ${pageCount}`;
    const normalized = normalizePdfText(text);
    const normalizedSuffix = normalizePdfText(suffix);
    if (!normalized.endsWith(normalizedSuffix)) {
      failStamp(
        `stamped header/footer not found at the extraction tail of page ${pageIndex + 1}`,
      );
    }
    // 归一为逐字符 1:1（部首/NFKC/ActualText 单字），按提取字符锚定剥离。
    let strip = 0;
    let remaining = normalizedSuffix.length;
    for (let index = text.length - 1; index >= 0 && remaining > 0; index -= 1) {
      strip += 1;
      if (normalizePdfText(text[index] ?? "").length > 0) {
        remaining -= 1;
      }
    }
    if (remaining !== 0) {
      failStamp(`stamp strip underflow on page ${pageIndex + 1}`);
    }
    parts.push(text.slice(0, text.length - strip));
  }
  return parts.join("");
}
