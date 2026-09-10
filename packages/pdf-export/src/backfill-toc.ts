import { TOC_HEADING, type TocEntry } from "@wenshu/document-model";

import { extractGeometry } from "./geometry.ts";
import { inflate, parseObjects } from "./inspect.ts";
import { buildIncrementalUpdate } from "./pdf-patch.ts";
import { normalizePdfText } from "./reconcile.ts";
import { assertSameGeometry, runsEqual } from "./backfill-toc-geometry.ts";
import {
  flattenExtractionPage,
  flattenTokens,
  pageContentIds,
  pageFontBindings,
} from "./backfill-toc-pages.ts";
import { scanContentStream } from "./backfill-toc-scan.ts";
import {
  fail,
  MAX_PAGE_DIGITS,
  PLACEHOLDER_SLOTS,
  type ExtractionChar,
  type FontBinding,
  type PlaceholderGroup,
  type ScannedPage,
  type ScanChar,
  type ShowToken,
} from "./backfill-toc-shared.ts";

/**
 * 目录页码字节级原地回填主入口（决策 #21：占位符渲染 + 单遍渲染 + 原内容流
 * 改写）。共享契约/类型见 backfill-toc-shared.ts，扫描/页装配/几何终验分别
 * 见 backfill-toc-scan.ts / backfill-toc-pages.ts / backfill-toc-geometry.ts。
 * 纪律不变：未知构造、配对失配、反查歧义、几何漂移一律 fail-closed。
 */

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
      for (
        let index = cursor;
        index + titleChars.length <= allChars.length;
        index += 1
      ) {
        if (
          titleChars.every((char, offset) => allChars[index + offset]?.char === char)
        ) {
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
  const editsByObject = new Map<
    number,
    { start: number; end: number; text: string }[]
  >();
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
        position >= scanned.charStart &&
        position < scanned.charStart + scanned.charCount,
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
