import { deflateSync, inflateSync } from "node:zlib";

import { PdfExportError } from "./errors.ts";
import { inspectPdf, type TextHole } from "./inspect.ts";
import { assertPdfReconciled } from "./reconcile.ts";

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
  let cursor = 0;
  let index = 0;
  const skipExpectedSpace = (): void => {
    while (cursor < expected.length && isSpace(expected[cursor] ?? "")) {
      cursor += 1;
    }
  };
  while (index < actual.length) {
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

function locateStream(
  bytes: Uint8Array,
  objectId: number,
): { readonly dict: string; readonly start: number; readonly end: number } {
  const text = Buffer.from(bytes).toString("latin1");
  const pattern = new RegExp(`\\b${objectId}\\s+0\\s+obj\\b`, "u");
  const match = pattern.exec(text);
  if (match === null) {
    failRepair(`object ${objectId} not found`);
  }
  const start = (match.index ?? 0) + match[0].length;
  const end = text.indexOf("endobj", start);
  const body = text.slice(start, end);
  const marker = body.indexOf("stream");
  if (marker === -1) {
    failRepair(`object ${objectId} has no stream`);
  }
  let streamStart = start + marker + "stream".length;
  if (text.startsWith("\r\n", streamStart)) {
    streamStart += 2;
  } else if (text.startsWith("\n", streamStart)) {
    streamStart += 1;
  }
  return {
    dict: body.slice(0, marker),
    start: streamStart,
    end: text.indexOf("endstream", streamStart),
  };
}

function readStreamText(bytes: Uint8Array, objectId: number): string {
  const location = locateStream(bytes, objectId);
  return inflateSync(
    new Uint8Array(Buffer.from(bytes).subarray(location.start, location.end)),
  ).toString("latin1");
}

function toHex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, "0");
}

/** CMap 增补：追加 last-wins beginbfchar 块（后定义覆盖先定义，读者与本检查器一致）。 */
export function patchCMapText(
  cmap: string,
  entries: ReadonlyMap<number, string>,
): string {
  const lines = [...entries.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, char]) => {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) {
        failRepair("repair assignment is not a single character");
      }
      return `<${code.toString(16).toUpperCase().padStart(2, "0")}> <${toHex(codePoint)}>`;
    });
  const block = `${lines.length} beginbfchar\n${lines.join("\n")}\nendbfchar\n`;
  const at = cmap.indexOf("endcmap");
  if (at === -1) {
    failRepair("cmap lacks endcmap marker");
  }
  return cmap.slice(0, at) + block + cmap.slice(at);
}

/** ActualText 定位改写：第 spanIndex 个 hex 型 span 的值必须等于 fromHex（守卫），再改写。 */
export function patchActualTextSpan(
  content: string,
  spanIndex: number,
  fromHex: string,
  toHexValue: string,
): string {
  const pattern = /\/ActualText\s*<([0-9A-Fa-f]+)>/gu;
  let seen = -1;
  for (const match of content.matchAll(pattern)) {
    seen += 1;
    if (seen !== spanIndex) {
      continue;
    }
    if ((match[1] ?? "").toUpperCase() !== fromHex.toUpperCase()) {
      failRepair("actualText guard mismatch: span content drifted");
    }
    const at = match.index ?? 0;
    return (
      content.slice(0, at) +
      `/ActualText <${toHexValue}>` +
      content.slice(at + match[0].length)
    );
  }
  failRepair(`actualText span ${spanIndex} not found`);
}

function buildIncrementalUpdate(
  original: Uint8Array,
  streamRewrites: ReadonlyMap<number, string>,
): Uint8Array {
  const text = Buffer.from(original).toString("latin1");
  const prevStart = /startxref\s+(\d+)\s*%%EOF\s*$/u.exec(text)?.[1];
  if (prevStart === undefined) {
    failRepair("original pdf lacks startxref");
  }
  const trailerMatch = /trailer\s*<<([\s\S]*?)>>\s*startxref/u.exec(text);
  const rootRef = /\/Root\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  const infoRef = /\/Info\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  if (rootRef === undefined) {
    failRepair("original trailer lacks /Root");
  }
  const parts: string[] = [];
  const offsets = new Map<number, number>();
  let cursor = original.length;
  const sorted = [...streamRewrites.entries()].sort((a, b) => a[0] - b[0]);
  for (const [objectId, streamText] of sorted) {
    const compressed = deflateSync(Buffer.from(streamText, "latin1"));
    const chunk =
      `${objectId} 0 obj\n<</Length ${compressed.length} /Filter /FlateDecode>>\nstream\n` +
      compressed.toString("latin1") +
      `\nendstream\nendobj\n`;
    offsets.set(objectId, cursor);
    parts.push(chunk);
    cursor += Buffer.byteLength(chunk, "latin1");
  }
  const xrefStart = cursor;
  const xrefLines: string[] = [];
  let index = 0;
  while (index < sorted.length) {
    const startId = sorted[index]?.[0] ?? 0;
    let end = index;
    while (
      end + 1 < sorted.length &&
      (sorted[end + 1]?.[0] ?? 0) === (sorted[end]?.[0] ?? 0) + 1
    ) {
      end += 1;
    }
    const segmentEntries = sorted
      .slice(index, end + 1)
      .map(
        ([objectId]) =>
          `${(offsets.get(objectId) ?? 0).toString().padStart(10, "0")} 00000 n \n`,
      )
      .join("");
    xrefLines.push(`${startId} ${end - index + 1}\n${segmentEntries}`);
    index = end + 1;
  }
  const maxObjectId = sorted[sorted.length - 1]?.[0] ?? 0;
  const trailer =
    `trailer\n<</Size ${maxObjectId + 1} /Root ${rootRef}` +
    (infoRef === undefined ? "" : ` /Info ${infoRef}`) +
    ` /Prev ${prevStart}>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const update = `xref\n${xrefLines.join("")}${trailer}`;
  const out = new Uint8Array(original.length + Buffer.byteLength(update, "latin1"));
  out.set(original, 0);
  out.set(Buffer.from(update, "latin1"), original.length);
  return out;
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
  const alignment = alignHoles(extraction, expectedText);
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
    streamRewrites.set(
      fontObjectId,
      patchCMapText(readStreamText(original, fontObjectId), entries),
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
  assertPdfReconciled(after.pages.map((page) => page.text).join(""), expectedText);
  return Object.freeze({
    pdfBytes: repaired,
    repairedHoles: before.holes.length,
    substitutions: alignment.substitutions.length,
    patchedObjects: streamRewrites.size,
  });
}
