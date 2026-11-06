import type { PdfGeometry } from "./geometry.ts";
import { inflate, parseToUnicode, type PdfObject } from "./inspect.ts";
import { normalizePdfText } from "./reconcile.ts";
import {
  fail,
  type ExtractionChar,
  type FontBinding,
  type ScanChar,
  type ShowToken,
} from "./backfill-toc-shared.ts";

// ---------------------------------------------------------------------------
// 页装配：资源字体绑定、逐页扫描、与签署提取的交叉校验
// ---------------------------------------------------------------------------

/** 页资源字典的 `/Tag id 0 R` 字体绑定（沿用 inspect/geometry 的整词口径）。 */
export function pageFontBindings(
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
    const toUnicodeRef = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(
      fontObject?.dict ?? "",
    )?.[1];
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

export function pageContentIds(pageDict: PdfObject): readonly number[] {
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

export function flattenExtractionPage(
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
export function flattenTokens(
  tokens: readonly ShowToken[],
  tokenOffset: number,
): ScanChar[] {
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
