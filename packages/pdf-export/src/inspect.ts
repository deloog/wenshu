import { inflateSync } from "node:zlib";

import { PdfExportError } from "./errors.ts";
import type { GlyphOrigin } from "./cmap-repair.ts";
import { extractOrderedText, type ToUnicodeMap } from "./extract.ts";

export interface TextHole {
  readonly pageIndex: number;
  readonly offset: number;
  readonly fontObjectId: number;
  readonly code: number;
}

/** 本检查器只支持自家管线产出的 Skia/Chromium PDF，未知结构一律 fail-closed。 */

export type PdfMetadata = Readonly<Record<string, string>>;

export interface PdfFontInfo {
  /** FontDescriptor 的 /FontName（如 AAAAAA+Noto-Sans-SC-Bold）。 */
  readonly name: string;
  readonly family: string;
  readonly weight: number | null;
  readonly subtype: string;
  readonly subset: boolean;
  /** 字形数据内嵌（FontFile 程序或 Type3 CharProcs 字形过程）。 */
  readonly embedded: boolean;
}

export interface PdfPageInfo {
  readonly mediaBox: readonly number[];
  readonly text: string;
}

export interface PdfInspection {
  readonly metadata: PdfMetadata;
  readonly xmp: string | null;
  readonly pageCount: number;
  readonly pageSizePt: readonly number[];
  readonly fonts: readonly PdfFontInfo[];
  readonly pages: readonly PdfPageInfo[];
  /** 无 ToUnicode 映射的字形洞（Skia m150 缺陷面，见 cmap-repair.ts）。 */
  readonly holes: readonly TextHole[];
  /** 与整篇提取文本同位对齐的字形来源（null = 无单一字形）。 */
  readonly origins: readonly (GlyphOrigin | null)[];
}

export interface PdfObject {
  readonly dict: string;
  readonly stream?: Uint8Array;
}

function fail(message: string): never {
  throw new PdfExportError("PDF_INSPECT_UNSUPPORTED", message);
}

export function parseObjects(bytes: Uint8Array): Map<number, PdfObject> {
  const text = Buffer.from(bytes).toString("latin1");
  const objects = new Map<number, PdfObject>();
  const pattern = /(\d+)\s+0\s+obj\b/g;
  for (const match of text.matchAll(pattern)) {
    const id = Number(match[1]);
    const start = (match.index ?? 0) + match[0].length;
    const end = text.indexOf("endobj", start);
    if (end === -1) {
      fail(`object ${id} is not terminated`);
    }
    const body = text.slice(start, end);
    const streamMarker = body.indexOf("stream");
    if (streamMarker === -1) {
      objects.set(id, { dict: body.trim() });
      continue;
    }
    const dict = body.slice(0, streamMarker).trim();
    const streamStart = start + streamMarker + "stream".length;
    let dataStart = streamStart;
    if (text.startsWith("\r\n", dataStart)) {
      dataStart += 2;
    } else if (text.startsWith("\n", dataStart)) {
      dataStart += 1;
    }
    const dataEnd = text.indexOf("endstream", dataStart);
    if (dataEnd === -1) {
      fail(`object ${id} stream is not terminated`);
    }
    objects.set(id, {
      dict,
      stream: new Uint8Array(Buffer.from(text.slice(dataStart, dataEnd), "latin1")),
    });
  }
  return objects;
}

export function inflate(object: PdfObject, context: string): string {
  if (object.stream === undefined) {
    fail(`${context} has no stream`);
  }
  if (!/FlateDecode/.test(object.dict)) {
    fail(`${context} uses an unsupported filter`);
  }
  return inflateSync(object.stream).toString("latin1");
}

export function decodePdfString(raw: string): string {
  if (raw.startsWith("<") && raw.endsWith(">")) {
    const hex = raw.slice(1, -1);
    const bytes = Buffer.from(hex, "hex");
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return bytes.subarray(2).swap16().toString("utf16le");
    }
    return bytes.toString("latin1");
  }
  if (raw.startsWith("(") && raw.endsWith(")")) {
    const body = raw.slice(1, -1);
    const bytes = Buffer.from(body, "latin1");
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return bytes.subarray(2).swap16().toString("utf16le");
    }
    return body.replace(/\\([()\\])/g, "$1");
  }
  fail("unsupported metadata string form");
}

function parseMetadata(objects: Map<number, PdfObject>): {
  metadata: PdfMetadata;
  xmp: string | null;
  rootId: number;
} {
  const texts = [...objects.entries()];
  let rootId = -1;
  let infoId = -1;
  for (const [id, object] of texts) {
    if (/\/Type\s*\/Catalog/.test(object.dict)) {
      rootId = id;
    }
  }
  // trailer 不在对象体内：从全文找 /Info 引用（Skia 仅一个 Info 字典）。
  let xmp: string | null = null;
  for (const [id, object] of texts) {
    if (/\/(Producer|CreationDate)/.test(object.dict) && id !== rootId) {
      infoId = id;
    }
    if (/\/Subtype\s*\/XML/.test(object.dict)) {
      xmp = object.stream === undefined ? null : inflate(object, "xmp metadata");
    }
  }
  const metadata: Record<string, string> = {};
  if (infoId !== -1) {
    const dict = objects.get(infoId)?.dict ?? "";
    for (const match of dict.matchAll(
      /\/([A-Za-z]+)\s*(<[^>]*>|\((?:[^()\\]|\\.)*\))/g,
    )) {
      metadata[match[1] ?? ""] = decodePdfString(match[2] ?? "");
    }
  }
  return { metadata: Object.freeze(metadata), xmp, rootId };
}

function utf16beHexToString(hex: string): string {
  const bytes = Buffer.from(hex, "hex");
  return bytes.swap16().toString("utf16le");
}

export function parseToUnicode(cmap: string): ToUnicodeMap {
  let codeLength = 2;
  const map = new Map<number, string>();
  // CMap 语法：N begincodespacerange <lo> <hi> endcodespacerange（区间在关键字之后）。
  const spaceMatch = /begincodespacerange\s*<([0-9A-Fa-f]+)>/u.exec(cmap);
  if (spaceMatch !== null) {
    codeLength = (spaceMatch[1] ?? "").length / 2;
  }
  for (const block of cmap.matchAll(/beginbfchar(.*?)endbfchar/gsu)) {
    for (const pair of (block[1] ?? "").matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      map.set(Number.parseInt(pair[1] ?? "", 16), utf16beHexToString(pair[2] ?? ""));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange(.*?)endbfrange/gsu)) {
    for (const range of (block[1] ?? "").matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[((?:\s*<[0-9A-Fa-f]+>)*)\s*\])/g,
    )) {
      const lo = Number.parseInt(range[1] ?? "", 16);
      const hi = Number.parseInt(range[2] ?? "", 16);
      if (range[4] !== undefined) {
        const base = Number.parseInt(range[4], 16);
        for (let code = lo; code <= hi; code += 1) {
          map.set(
            code,
            utf16beHexToString((base + (code - lo)).toString(16).padStart(4, "0")),
          );
        }
      } else {
        const items = [...(range[5] ?? "").matchAll(/<([0-9A-Fa-f]+)>/g)].map(
          (m) => m[1] ?? "",
        );
        for (let code = lo; code <= hi; code += 1) {
          const item = items[code - lo];
          if (item !== undefined) {
            map.set(code, utf16beHexToString(item));
          }
        }
      }
    }
  }
  return { codeLength, map };
}

/** 解析自家管线 PDF：元数据、页尺寸、字体（内嵌/子集）与逐页文本层。 */
export function inspectPdf(bytes: Uint8Array): PdfInspection {
  const objects = parseObjects(bytes);
  if (objects.size === 0) {
    fail("no pdf objects found");
  }
  const { metadata, xmp } = parseMetadata(objects);

  const fontInfos: PdfFontInfo[] = [];
  const toUnicodeByTag = new Map<string, ToUnicodeMap>();
  const fontIdByTag = new Map<string, number>();
  const pageDicts = [...objects.values()].filter(
    (object) =>
      /\/Type\s*\/Page\b/.test(object.dict) && !/\/Type\s*\/Pages\b/.test(object.dict),
  );
  // 先收齐字体对象 id，再整词解析资源字典的 `/Tag id 0 R` 对——
  // 避免 `46` 撞上 `/F146 146 0 R` 这类数字后缀误配（巡/既错码根因）。
  const fontObjectIds = new Set<number>();
  for (const [id, object] of objects) {
    if (/\/Type\s*\/Font\b/.test(object.dict)) {
      fontObjectIds.add(id);
    }
  }
  const tagByFontId = new Map<number, string>();
  for (const pageDict of pageDicts) {
    for (const match of pageDict.dict.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      const refId = Number(match[2]);
      if (fontObjectIds.has(refId)) {
        tagByFontId.set(refId, match[1] ?? "");
      }
    }
  }
  for (const [id, object] of objects) {
    if (!/\/Type\s*\/Font\b/.test(object.dict)) {
      continue;
    }
    const subtype = /\/Subtype\s*\/([A-Za-z0-9]+)/.exec(object.dict)?.[1] ?? "";
    // Type0 为复合字体：名称在自身 /BaseFont，描述符在 CIDFont 后代；
    // Skia 命名事实：冻结 OTF（Source Han Sans CN）可能以联合设计别名
    // Noto Sans SC 登记（/FontName、/FontFamily、/FontWeight）。
    const descendantRef = /\/DescendantFonts\s*\[\s*(\d+)\s+0\s+R\s*\]/.exec(
      object.dict,
    )?.[1];
    const descendant =
      descendantRef === undefined ? undefined : objects.get(Number(descendantRef));
    const descriptorRef = /\/FontDescriptor\s+(\d+)\s+0\s+R/.exec(
      descendant?.dict ?? object.dict,
    )?.[1];
    const descriptor =
      descriptorRef === undefined ? undefined : objects.get(Number(descriptorRef));
    const nameCandidates = [
      /\/BaseFont\s*\/([A-Za-z0-9+.,-]+)/.exec(object.dict)?.[1],
      descendant === undefined
        ? undefined
        : (/\/BaseFont\s*\/([A-Za-z0-9+.,-]+)/.exec(descendant.dict)?.[1] ?? undefined),
      descriptor === undefined
        ? undefined
        : (/\/FontName\s*\/([A-Za-z0-9+.,-]+)/.exec(descriptor.dict)?.[1] ?? undefined),
    ];
    const name =
      nameCandidates.find((candidate) => candidate !== undefined && candidate !== "") ??
      "";
    const familyRaw =
      descriptor === undefined
        ? ""
        : (/\/FontFamily\s*(\((?:[^()\\]|\\.)*\))/.exec(descriptor.dict)?.[1] ?? "");
    const family = familyRaw.startsWith("(") ? decodePdfString(familyRaw) : familyRaw;
    const weightRaw =
      descriptor === undefined
        ? undefined
        : /\/FontWeight\s+(\d+)/.exec(descriptor.dict)?.[1];
    const embedded =
      descriptor !== undefined &&
      (/\/FontFile\d/.test(descriptor.dict) ||
        (subtype === "Type3" && /\/CharProcs/.test(object.dict)));
    fontInfos.push(
      Object.freeze({
        name,
        family,
        weight: weightRaw === undefined ? null : Number(weightRaw),
        subtype,
        subset: name.includes("+"),
        embedded,
      }),
    );
    const toUnicodeRef = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(object.dict)?.[1];
    const toUnicodeObject =
      toUnicodeRef === undefined ? undefined : objects.get(Number(toUnicodeRef));
    const tag = tagByFontId.get(id);
    if (tag !== undefined) {
      fontIdByTag.set(tag, id);
      if (toUnicodeObject !== undefined) {
        toUnicodeByTag.set(tag, parseToUnicode(inflate(toUnicodeObject, "tounicode")));
      }
    }
  }

  const pages: PdfPageInfo[] = [];
  const holes: TextHole[] = [];
  const origins: (GlyphOrigin | null)[] = [];
  let pageSizePt: readonly number[] = [];
  let runningOffset = 0;
  for (const object of pageDicts) {
    const box = /\/MediaBox\s*\[([\d.\s]+)\]/.exec(object.dict)?.[1];
    if (box === undefined) {
      fail("page without MediaBox");
    }
    const mediaBox = box.trim().split(/\s+/).map(Number);
    if (pageSizePt.length === 0) {
      pageSizePt = Object.freeze([mediaBox[2] ?? 0, mediaBox[3] ?? 0]);
    }
    const contentIds = [
      ...object.dict.matchAll(
        /\/Contents\s+(?:(\d+)\s+0\s+R|\[((?:\s*\d+\s+0\s+R)*)\s*\])/g,
      ),
    ];
    let text = "";
    for (const contentId of contentIds) {
      const ids =
        contentId[1] !== undefined
          ? [Number(contentId[1])]
          : [...(contentId[2] ?? "").matchAll(/(\d+)\s+0\s+R/g)].map((m) =>
              Number(m[1]),
            );
      for (const id of ids) {
        const content = objects.get(id);
        if (content === undefined) {
          fail(`page content object ${id} is missing`);
        }
        const extracted = extractOrderedText(
          inflate(content, "page content"),
          toUnicodeByTag,
          fontIdByTag,
          pageDicts.indexOf(object),
          runningOffset,
          id,
        );
        text += extracted.text;
        holes.push(...extracted.holes);
        origins.push(...extracted.origins);
        runningOffset += [...extracted.text].length;
      }
    }
    pages.push(Object.freeze({ mediaBox: Object.freeze(mediaBox), text }));
  }
  if (pages.length === 0) {
    fail("no pages found");
  }
  return Object.freeze({
    metadata,
    xmp,
    pageCount: pages.length,
    pageSizePt,
    fonts: Object.freeze(fontInfos),
    pages: Object.freeze(pages),
    holes: Object.freeze(holes),
    origins: Object.freeze(origins),
  });
}
