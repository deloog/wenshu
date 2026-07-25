import { deflateSync, inflateSync } from "node:zlib";

import { PdfExportError } from "./errors.ts";

/** PDF 结构补丁：CMap 增补、ActualText 定位改写、增量更新写入。 */

export function failPatch(message: string): never {
  throw new PdfExportError("PDF_EXPORT_RECONCILE_FAILED", message);
}

function locateStream(
  bytes: Uint8Array,
  objectId: number,
): { readonly dict: string; readonly start: number; readonly end: number } {
  const text = Buffer.from(bytes).toString("latin1");
  const pattern = new RegExp(`\\b${objectId}\\s+0\\s+obj\\b`, "u");
  const match = pattern.exec(text);
  if (match === null) {
    failPatch(`object ${objectId} not found`);
  }
  const start = (match.index ?? 0) + match[0].length;
  const end = text.indexOf("endobj", start);
  const body = text.slice(start, end);
  const marker = body.indexOf("stream");
  if (marker === -1) {
    failPatch(`object ${objectId} has no stream`);
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

export function readStreamText(bytes: Uint8Array, objectId: number): string {
  const location = locateStream(bytes, objectId);
  return inflateSync(
    new Uint8Array(Buffer.from(bytes).subarray(location.start, location.end)),
  ).toString("latin1");
}

/** 字体 /ToUnicode 引用的对象号。 */
export function resolveToUnicodeRef(bytes: Uint8Array, fontObjectId: number): number {
  const text = Buffer.from(bytes).toString("latin1");
  const pattern = new RegExp(`\\b${fontObjectId}\\s+0\\s+obj\\b`, "u");
  const match = pattern.exec(text);
  if (match === null) {
    failPatch(`font object ${fontObjectId} not found`);
  }
  const end = text.indexOf("endobj", match.index ?? 0);
  const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(
    text.slice(match.index ?? 0, end),
  )?.[1];
  if (ref === undefined) {
    failPatch(`font object ${fontObjectId} has no ToUnicode`);
  }
  return Number(ref);
}

export function toHex(codePoint: number): string {
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
        failPatch("repair assignment is not a single character");
      }
      return `<${code.toString(16).toUpperCase().padStart(2, "0")}> <${toHex(codePoint)}>`;
    });
  const block = `${lines.length} beginbfchar\n${lines.join("\n")}\nendbfchar\n`;
  const at = cmap.indexOf("endcmap");
  if (at === -1) {
    failPatch("cmap lacks endcmap marker");
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
      failPatch("actualText guard mismatch: span content drifted");
    }
    const at = match.index ?? 0;
    return (
      content.slice(0, at) +
      `/ActualText <${toHexValue}>` +
      content.slice(at + match[0].length)
    );
  }
  failPatch(`actualText span ${spanIndex} not found`);
}

export function buildIncrementalUpdate(
  original: Uint8Array,
  streamRewrites: ReadonlyMap<number, string>,
): Uint8Array {
  const text = Buffer.from(original).toString("latin1");
  const prevStart = /startxref\s+(\d+)\s*%%EOF\s*$/u.exec(text)?.[1];
  if (prevStart === undefined) {
    failPatch("original pdf lacks startxref");
  }
  const trailerMatch = /trailer\s*<<([\s\S]*?)>>\s*startxref/u.exec(text);
  const rootRef = /\/Root\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  const infoRef = /\/Info\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  if (rootRef === undefined) {
    failPatch("original trailer lacks /Root");
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
  const update = `${parts.join("")}xref\n${xrefLines.join("")}${trailer}`;
  const out = new Uint8Array(original.length + Buffer.byteLength(update, "latin1"));
  out.set(original, 0);
  out.set(Buffer.from(update, "latin1"), original.length);
  return out;
}
