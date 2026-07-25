import { deflateSync, inflateSync } from "node:zlib";

import { PdfExportError } from "./errors.ts";
import { inspectPdf, type TextHole } from "./inspect.ts";
import { assertPdfReconciled } from "./reconcile.ts";
import {
  buildIncrementalUpdate,
  patchActualTextSpan,
  patchCMapText,
  readStreamText,
  resolveToUnicodeRef,
  toHex,
} from "./pdf-patch.ts";

/**
 * ToUnicode/ActualText 修复层：Skia m150 的标签缺陷三类面——
 * (a) 个别字形实例无 ToUnicode 映射（洞）；
 * (b) ToUnicode 把字形错标为另一字符（如 巡→既）；
 * (c) ActualText 与 CMap 同步错标。
 * 修复 = 受约束对齐推断每处正确字符 → CMap 追加 last-wins 映射 + ActualText 定位改写
 * → PDF 增量更新 → 重新提取逐字验证。原始字节前缀不变；任何不可解即 fail-closed。
 */

export interface GlyphOrigin {
  readonly fontObjectId: number;
  readonly code: number;
  readonly viaActualText: boolean;
  /** hex 型 ActualText 在所属内容流中的序号（-1 = 非 ActualText 来源）。 */
  readonly spanIndex: number;
  readonly contentObjectId: number;
}

export interface ExtractionWithHoles {
  readonly text: string;
  readonly holes: readonly TextHole[];
  /** 与 text 同位对齐的字形来源；null = 无单一字形（合字/多字符 ActualText）。 */
  readonly origins: readonly (GlyphOrigin | null)[];
}

const LIGATURES: Readonly<Record<string, string>> = Object.freeze({
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
});

const RADICALS: ReadonlyMap<number, string> = new Map([
  [0x2ed3, "长"],
  [0x2edb, "风"],
  [0x2eda, "页"],
]);

const FORMAT_CHARS = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/u;

function failRepair(message: string): never {
  throw new PdfExportError("PDF_EXPORT_RECONCILE_FAILED", message);
}

function isSpace(char: string): boolean {
  return /\s/u.test(char);
}

function isIgnorable(char: string): boolean {
  return isSpace(char) || FORMAT_CHARS.test(char);
}

function normalizeChar(char: string): string {
  const codePoint = char.codePointAt(0) ?? 0;
  const radical = RADICALS.get(codePoint);
  if (radical !== undefined) {
    return radical;
  }
  return char.normalize("NFKC");
}

function computeRepeatSkipSpans(
  actual: readonly string[],
  repeatables: readonly string[],
): ReadonlyMap<number, number> {
  const spans = new Map<number, number>();
  for (const repeatable of repeatables) {
    const needle = [...repeatable]
      .filter((char) => !isIgnorable(char))
      .map((char) => normalizeChar(char));
    if (needle.length === 0) {
      continue;
    }
    const occurrences: Array<[number, number]> = [];
    let start = 0;
    while (start < actual.length) {
      let i = start;
      let j = 0;
      while (j < needle.length && i < actual.length) {
        const char = actual[i] ?? "";
        if (isIgnorable(char)) {
          i += 1;
          continue;
        }
        if (normalizeChar(char) !== needle[j]) {
          break;
        }
        i += 1;
        j += 1;
      }
      if (j === needle.length) {
        occurrences.push([start, i]);
        start = i;
      } else {
        start += 1;
      }
    }
    // 保留首个出现（按正文对齐），其余登记为跳过区。
    for (const [from, to] of occurrences.slice(1)) {
      spans.set(from, to);
    }
  }
  return spans;
}

export interface Substitution {
  readonly fontObjectId: number;
  readonly code: number;
  readonly viaActualText: boolean;
  readonly spanIndex: number;
  readonly contentObjectId: number;
  readonly char: string;
  /** 被错标的原字符码点（用于 ActualText 守卫 hex）。 */
  readonly fromCodePoint: number;
}

export interface AlignmentResult {
  readonly holeAssignments: ReadonlyMap<number, string>;
  readonly substitutions: readonly Substitution[];
}

/**
 * 受约束对齐：提取文本（含洞与可能错标）逐位匹配真源文本。
 * 允许：部首/合字/全角等价、布局空白与格式字符、洞 ← 真源字符、
 * 有字形来源的单字符替换（记录为 substitution 待修复）。其余分歧 fail-closed。
 */
export function alignHoles(
  extraction: ExtractionWithHoles,
  expectedText: string,
  repeatables: readonly string[] = [],
): AlignmentResult {
  const assignments = new Map<number, string>();
  const substitutions: Substitution[] = [];
  const holesByOffset = new Map<number, TextHole[]>();
  for (const hole of extraction.holes) {
    const pending = holesByOffset.get(hole.offset) ?? [];
    pending.push(hole);
    holesByOffset.set(hole.offset, pending);
  }
  const expected = [...expectedText];
  const actual = [...extraction.text];
  // 渲染器重绘表头：首个出现按正文对齐，后续出现整体跳过（不占真源位置）。
  const skipSpans = computeRepeatSkipSpans(actual, repeatables);
  let cursor = 0;
  let index = 0;
  const skipExpectedSpace = (): void => {
    while (cursor < expected.length && isSpace(expected[cursor] ?? "")) {
      cursor += 1;
    }
  };
  while (index < actual.length) {
    const skipEnd = skipSpans.get(index);
    if (skipEnd !== undefined) {
      index = skipEnd;
      continue;
    }
    skipExpectedSpace();
    const pending = holesByOffset.get(index);
    if (pending !== undefined && pending.length > 0) {
      const hole = pending.shift();
      if (hole === undefined) {
        failRepair("hole queue corrupted");
      }
      if (cursor >= expected.length) {
        failRepair(`hole beyond expected text at ${index}`);
      }
      assignments.set(hole.offset, expected[cursor] ?? "");
      cursor += 1;
      continue;
    }
    const char = actual[index] ?? "";
    if (isIgnorable(char)) {
      index += 1;
      continue;
    }
    const ligature = LIGATURES[char];
    if (ligature !== undefined) {
      if (expected.slice(cursor, cursor + ligature.length).join("") !== ligature) {
        failRepair(`ligature mismatch at ${index}`);
      }
      cursor += ligature.length;
      index += 1;
      continue;
    }
    if (normalizeChar(char) !== normalizeChar(expected[cursor] ?? "")) {
      // 有字形来源的单字符替换：记录为 substitution（修复 cmap/ActualText 标签）。
      const origin = extraction.origins[index];
      if (origin === null || origin === undefined || expected[cursor] === undefined) {
        failRepair(
          `unresolvable divergence at extracted offset ${index} (expected cursor ${cursor})`,
        );
      }
      substitutions.push(
        Object.freeze({
          fontObjectId: origin.fontObjectId,
          code: origin.code,
          viaActualText: origin.viaActualText,
          spanIndex: origin.spanIndex,
          contentObjectId: origin.contentObjectId,
          char: expected[cursor] ?? "",
          fromCodePoint: char.codePointAt(0) ?? 0,
        }),
      );
      cursor += 1;
      index += 1;
      continue;
    }
    cursor += 1;
    index += 1;
  }
  skipExpectedSpace();
  if (cursor !== expected.length) {
    failRepair(`expected text not fully consumed (${cursor}/${expected.length})`);
  }
  return Object.freeze({
    holeAssignments: assignments,
    substitutions: Object.freeze(substitutions),
  });
}

export interface RepairResult {
  readonly pdfBytes: Uint8Array;
  readonly repairedHoles: number;
  readonly substitutions: number;
  readonly patchedObjects: number;
}

/**
 * 修复主流程：对齐推断 → CMap last-wins 增补 + ActualText 定位改写 → 增量更新 → 重新验证。
 * 成功保证：重新提取与真源逐字一致、原始字节前缀不变、无残留洞。
 */
export function repairPdfTextLayer(
  original: Uint8Array,
  expectedText: string,
  repeatables: readonly string[] = [],
): RepairResult {
  const before = inspectPdf(original);
  const extractedBefore = before.pages.map((page) => page.text).join("");
  // 快速路径：对账已过且无洞，无需修复。
  if (before.holes.length === 0) {
    try {
      assertPdfReconciled(extractedBefore, expectedText);
      return Object.freeze({
        pdfBytes: original,
        repairedHoles: 0,
        substitutions: 0,
        patchedObjects: 0,
      });
    } catch {
      // 对账失败进入修复流程。
    }
  }
  const extraction: ExtractionWithHoles = Object.freeze({
    text: extractedBefore,
    holes: before.holes,
    origins: before.origins,
  });
  const alignment = alignHoles(extraction, expectedText, repeatables);
  const cmapEntries = new Map<number, Map<number, string>>();
  const remember = (fontObjectId: number, code: number, char: string): void => {
    const entries = cmapEntries.get(fontObjectId) ?? new Map<number, string>();
    const existing = entries.get(code);
    if (existing !== undefined && existing !== char) {
      failRepair("inconsistent repair inference for the same font code");
    }
    entries.set(code, char);
    cmapEntries.set(fontObjectId, entries);
  };
  for (const hole of before.holes) {
    const char = alignment.holeAssignments.get(hole.offset);
    if (char === undefined) {
      failRepair(`hole at offset ${hole.offset} has no assignment`);
    }
    remember(hole.fontObjectId, hole.code, char);
  }
  for (const substitution of alignment.substitutions) {
    remember(substitution.fontObjectId, substitution.code, substitution.char);
  }
  const streamRewrites = new Map<number, string>();
  for (const [fontObjectId, entries] of cmapEntries) {
    const toUnicodeId = resolveToUnicodeRef(original, fontObjectId);
    streamRewrites.set(
      toUnicodeId,
      patchCMapText(readStreamText(original, toUnicodeId), entries),
    );
  }
  for (const substitution of alignment.substitutions) {
    if (!substitution.viaActualText) {
      continue;
    }
    const codePoint = substitution.char.codePointAt(0);
    if (codePoint === undefined) {
      failRepair("substitution is not a single character");
    }
    const prior =
      streamRewrites.get(substitution.contentObjectId) ??
      readStreamText(original, substitution.contentObjectId);
    streamRewrites.set(
      substitution.contentObjectId,
      patchActualTextSpan(
        prior,
        substitution.spanIndex,
        `FEFF${toHex(substitution.fromCodePoint)}`,
        `FEFF${toHex(codePoint)}`,
      ),
    );
  }
  const repaired = buildIncrementalUpdate(original, streamRewrites);
  if (
    !Buffer.from(repaired).subarray(0, original.length).equals(Buffer.from(original))
  ) {
    failRepair("incremental update altered the original byte prefix");
  }
  const after = inspectPdf(repaired);
  if (after.holes.length !== 0) {
    failRepair(`repair left ${after.holes.length} holes unpatched`);
  }
  assertPdfReconciled(
    after.pages.map((page) => page.text).join(""),
    expectedText,
    repeatables,
  );
  return Object.freeze({
    pdfBytes: repaired,
    repairedHoles: before.holes.length,
    substitutions: alignment.substitutions.length,
    patchedObjects: streamRewrites.size,
  });
}
