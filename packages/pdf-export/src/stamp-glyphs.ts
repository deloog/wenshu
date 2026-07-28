import { PdfExportError } from "./errors.ts";
import { inflate, inspectPdf, parseObjects, parseToUnicode } from "./inspect.ts";
import { normalizePdfText } from "./reconcile.ts";

/**
 * 压印字符复刻（PA-11A，stamp.ts 的字形半）：逐字在引擎自身产物中找忠实
 * 表示——优先复用已内嵌子集字体 ToUnicode 单字符映射（部首码位视同归一后
 * 等价）；无单字符映射的字（如「文」）复刻检查器 origins 记录的引擎原始
 * （字体对象, 字形码, ActualText）表示。画的是同一字形，文本层标注与引擎
 * 一致，绝不虚构字形；两路均无即 fail-closed（宁缺印，不虚构）。
 */

/** 压印字号（pt）：模板无页眉页脚 token，补偿层钉定常量（ADR-0010）。 */
export const STAMP_FONT_SIZE = 9;

/** 单字符表示：普通 Tj 或 ActualText 复刻（引擎原表示）。 */
export interface CharRep {
  readonly fontObjectId: number;
  readonly code: number;
  readonly codeLength: number;
  /** 需要 ActualText 包装时的标注字符（无单字符 ToUnicode 映射的引擎原表示）。 */
  readonly actualText: string | null;
}

function failGlyphs(message: string): never {
  throw new PdfExportError("PDF_EXPORT_STAMP_FAILED", message);
}

/**
 * 逐字解析压印字符的复刻表示：
 * A. 子集字体 ToUnicode 单字符映射（归一等价：部首码位 NFKC 归位后同字即可）；
 * B. 检查器 origins 的引擎原表示（同字体同码，ActualText 单字来源）。
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
    }
    for (const char of missing) {
      if (!reps.has(char)) {
        failGlyphs("stamp character has no faithful glyph representation");
      }
    }
  }
  return reps;
}

function encodeChar(rep: CharRep): string {
  return rep.code
    .toString(16)
    .toUpperCase()
    .padStart(rep.codeLength * 2, "0");
}

function actualTextHex(char: string): string {
  return `FEFF${[...char]
    .map((part) =>
      (part.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"),
    )
    .join("")}`;
}

/** 一行压印内容：逐字 Tf 切换 + 必要时 ActualText 包装（字形推进由字体宽度表完成）。 */
export function stampLine(
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
      failGlyphs("stamp line contains an unresolved character");
    }
    const tag = tags.get(rep.fontObjectId);
    if (tag === undefined) {
      failGlyphs("stamp font is not registered on the page");
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
