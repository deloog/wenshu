import { deflateSync } from "node:zlib";

import { PdfExportError } from "./errors.ts";
import { parseObjects } from "./inspect.ts";
import { normalizePdfText } from "./reconcile.ts";
import { STAMP_FONT_SIZE, resolveStampReps, stampLine } from "./stamp-glyphs.ts";
import {
  assertStampBandsClear,
  buildStampUpdate,
  listPages,
  type StampAddition,
} from "./stamp-update.ts";

/**
 * 页眉页脚 PDF 层压印（PA-11A 受控补偿，ADR-0010）：Chromium 不支持
 * @page 页边盒与 target-counter（能力触顶已书面登记），页眉 short_title
 * 与页脚「N / total」由本模块在打印产物上以增量更新压印。
 * 受控性来源：
 * - 字形表示逐字复刻引擎自身产物（stamp-glyphs.ts：ToUnicode 单字映射优先，
 *   origins ActualText 引擎原表示兜底，绝不虚构字形）；
 * - 位置钉在模板上边距/下边距带内（公式唯一，不逐页写死）；
 * - 压印带与既有内容包围盒零交叠（stamp-update.ts 几何自检，交叠即失败）；
 * - 封面（物理第 1 页）豁免；
 * - 压印后重新提取：逐页剥离压印串再逐字对账（位置锚定，非计数猜测）。
 */

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
  const fontEntries = fontIds.map((id) => `/${tags.get(id) ?? ""} ${id} 0 R`).join("");

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
