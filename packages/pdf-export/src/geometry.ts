import { PdfExportError } from "./errors.ts";
import {
  decodePdfString,
  inflate,
  parseObjects,
  parseToUnicode,
  type PdfObject,
} from "./inspect.ts";
import { extractContentGeometry, type Type3FontGeometry } from "./geometry-text.ts";

/**
 * 几何保留提取：在 inspectPdf 的对象/页面发现之上，产出逐 run 的包围盒、
 * 基线、字体引用与 /Figure 图形 span 的包围盒及结构树 alt 文本。
 * 坐标系为 PDF 用户空间（pt，y 向上）：baselineY 取 apply(CTM, Tm) 的 y，
 * bbox.y 为 run 顶边 = 基线 + 上升量（与 y 向下的直觉相反，见 GeometryBBox）。
 * 只支持自家管线产出的 Skia/Chromium PDF，未知结构一律 fail-closed。
 */

export interface GeometryBBox {
  readonly x: number;
  /** 顶边 y（PDF 用户空间 y 向上，故顶边 = baselineY + 上升量）。 */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GeometryFontRef {
  readonly objectId: number;
  readonly tag: string;
  readonly family: string;
  readonly weight: number | null;
  readonly subset: boolean;
  readonly embedded: boolean;
}

export interface GeometryTextRun {
  readonly pageIndex: number;
  readonly text: string;
  readonly bbox: GeometryBBox;
  readonly baselineY: number;
  readonly fontSize: number;
  readonly font: GeometryFontRef;
  /** 与 extract.ts 相同的 NonStruct MCID 块序语义。 */
  readonly blockOrder: number;
  readonly viaActualText: boolean;
  /**
   * /Figure 成员标记（解析期结构事实，决策 #10）：run 的全部字形都在同一
   * 个 /Figure BDC…EMC span 内发出时为该 span 的 MCID，否则 null（含跨
   * span 边界的混合 run——骑缝等价于非成员）。禁任何 bbox 几何推断。
   */
  readonly figureMcid: number | null;
}

export interface GeometryFigure {
  readonly pageIndex: number;
  readonly mcid: number;
  /** 路径几何（含 clip 矩形）与 span 内文本 run 包围盒的并集。 */
  readonly bbox: GeometryBBox;
  /**
   * 绘制包围盒：仅绘制算子（f/F/S/s/B/b 家族）消费的路径点与 span 内文本
   * run 包围盒的并集；clip（W n）不计入（clip 不绘制，PDF 语义）。
   * 自家管线 SVG 根背景的版心全域矩形是 clip——bbox 含它、paintBBox 不含。
   */
  readonly paintBBox: GeometryBBox;
  readonly altShort: string | null;
  readonly altLong: string | null;
}

export interface GeometryPage {
  readonly index: number;
  readonly mediaBox: readonly number[];
  readonly rotate: 0 | 90 | 180 | 270;
}

export interface PdfGeometry {
  readonly pages: readonly GeometryPage[];
  /** PA-05 阅读序（块序 → y 桶 8 降序 → x 升序），按页拼接。 */
  readonly textRuns: readonly GeometryTextRun[];
  readonly figures: readonly GeometryFigure[];
}

function fail(message: string): never {
  throw new PdfExportError("PDF_INSPECT_UNSUPPORTED", message);
}

function numberList(raw: string): number[] {
  return raw
    .trim()
    .split(/\s+/u)
    .map((part) => Number(part));
}

/** 字体几何 walk：只接受带完整 Type3 几何字段的被引用字体，否则 fail-closed。 */
function walkFontGeometries(
  objects: Map<number, PdfObject>,
  pageDicts: readonly PdfObject[],
): Map<string, Type3FontGeometry> {
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
  const fonts = new Map<string, Type3FontGeometry>();
  for (const [id, object] of objects) {
    const tag = tagByFontId.get(id);
    if (tag === undefined) {
      continue;
    }
    const firstCharRaw = /\/FirstChar\s+(\d+)/.exec(object.dict)?.[1];
    const widthsRaw = /\/Widths\s*\[([\d.\s-]*)\]/.exec(object.dict)?.[1];
    const matrixRaw = /\/FontMatrix\s*\[([\d.\s-]*)\]/.exec(object.dict)?.[1];
    const bboxRaw = /\/FontBBox\s*\[([\d.\s-]*)\]/.exec(object.dict)?.[1];
    if (
      firstCharRaw === undefined ||
      widthsRaw === undefined ||
      matrixRaw === undefined ||
      bboxRaw === undefined
    ) {
      fail("referenced font lacks Type3 geometry fields");
    }
    const descriptorRef = /\/FontDescriptor\s+(\d+)\s+0\s+R/.exec(object.dict)?.[1];
    const descriptor =
      descriptorRef === undefined ? undefined : objects.get(Number(descriptorRef));
    const name =
      /\/BaseFont\s*\/([A-Za-z0-9+.,-]+)/.exec(object.dict)?.[1] ??
      (descriptor === undefined
        ? ""
        : (/\/FontName\s*\/([A-Za-z0-9+.,-]+)/.exec(descriptor.dict)?.[1] ?? ""));
    const familyRaw =
      descriptor === undefined
        ? ""
        : (/\/FontFamily\s*(\((?:[^()\\]|\\.)*\))/.exec(descriptor.dict)?.[1] ?? "");
    const weightRaw =
      descriptor === undefined
        ? undefined
        : /\/FontWeight\s+(\d+)/.exec(descriptor.dict)?.[1];
    const toUnicodeRef = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(object.dict)?.[1];
    const toUnicodeObject =
      toUnicodeRef === undefined ? undefined : objects.get(Number(toUnicodeRef));
    const toUnicode =
      toUnicodeObject === undefined
        ? { codeLength: 1, map: new Map<number, string>() }
        : parseToUnicode(inflate(toUnicodeObject, "tounicode"));
    fonts.set(
      tag,
      Object.freeze({
        objectId: id,
        ref: Object.freeze({
          objectId: id,
          tag,
          family:
            familyRaw !== ""
              ? decodePdfString(familyRaw)
              : name.replace(/^[A-Z]+\+/, ""),
          weight: weightRaw === undefined ? null : Number(weightRaw),
          subset: name.includes("+"),
          embedded: /\/CharProcs/.test(object.dict),
        }),
        codeLength: toUnicode.codeLength,
        map: toUnicode.map,
        firstChar: Number(firstCharRaw),
        widths: Object.freeze(numberList(widthsRaw)),
        fontMatrix: Object.freeze(numberList(matrixRaw)),
        fontBBox: Object.freeze(numberList(bboxRaw)),
      }),
    );
  }
  return fonts;
}

interface StructElemInfo {
  readonly isFigure: boolean;
  readonly alt: string | null;
  /** 叶子：/K 为裸 MCID 数字（排除 `/K n 0 R` 引用形式）。 */
  readonly leafMcid: number | null;
  readonly pageId: number | null;
  readonly parentId: number | null;
}

function walkStructElems(objects: Map<number, PdfObject>): Map<number, StructElemInfo> {
  const elems = new Map<number, StructElemInfo>();
  for (const [id, object] of objects) {
    if (!/\/Type\s*\/StructElem/.test(object.dict)) {
      continue;
    }
    const altRaw = /\/Alt\s*(<[^>]*>|\((?:[^()\\]|\\.)*\))/.exec(object.dict)?.[1];
    const leafRaw = /\/K\s+(\d+)(?!\s+\d)/.exec(object.dict)?.[1];
    const pageRaw = /\/Pg\s+(\d+)\s+0\s+R/.exec(object.dict)?.[1];
    const parentRaw = /\/P\s+(\d+)\s+0\s+R/.exec(object.dict)?.[1];
    elems.set(
      id,
      Object.freeze({
        isFigure: /\/S\s*\/Figure\b/.test(object.dict),
        alt: altRaw === undefined ? null : decodePdfString(altRaw),
        leafMcid: leafRaw === undefined ? null : Number(leafRaw),
        pageId: pageRaw === undefined ? null : Number(pageRaw),
        parentId: parentRaw === undefined ? null : Number(parentRaw),
      }),
    );
  }
  return elems;
}

/** 解析自家管线 PDF 的几何事实：页框、逐 run 文本几何与图形 span。 */
export function extractGeometry(bytes: Uint8Array): PdfGeometry {
  const objects = parseObjects(bytes);
  if (objects.size === 0) {
    fail("no pdf objects found");
  }
  const pageEntries = [...objects.entries()].filter(
    ([, object]) =>
      /\/Type\s*\/Page\b/.test(object.dict) && !/\/Type\s*\/Pages\b/.test(object.dict),
  );
  if (pageEntries.length === 0) {
    fail("no pages found");
  }
  const fonts = walkFontGeometries(
    objects,
    pageEntries.map(([, object]) => object),
  );
  const structElems = walkStructElems(objects);
  const pageIndexById = new Map<number, number>(
    pageEntries.map(([id], index) => [id, index]),
  );

  const pages: GeometryPage[] = [];
  const textRuns: GeometryTextRun[] = [];
  const figureSpans: {
    pageIndex: number;
    mcid: number;
    bbox: GeometryBBox;
    paintBBox: GeometryBBox;
  }[] = [];
  for (const [, pageDict] of pageEntries) {
    const pageIndex = pages.length;
    const box = /\/MediaBox\s*\[([\d.\s]+)\]/.exec(pageDict.dict)?.[1];
    if (box === undefined) {
      fail("page without MediaBox");
    }
    const rotateRaw = /\/Rotate\s+(-?\d+)/.exec(pageDict.dict)?.[1];
    const rotateNum = rotateRaw === undefined ? 0 : Number(rotateRaw);
    if (rotateNum !== 0 && rotateNum !== 90 && rotateNum !== 180 && rotateNum !== 270) {
      fail("page with unsupported Rotate");
    }
    const rotate: GeometryPage["rotate"] = rotateNum;
    pages.push(
      Object.freeze({
        index: pageIndex,
        mediaBox: Object.freeze(numberList(box)),
        rotate,
      }),
    );
    const contentIds = [
      ...pageDict.dict.matchAll(
        /\/Contents\s+(?:(\d+)\s+0\s+R|\[((?:\s*\d+\s+0\s+R)*)\s*\])/g,
      ),
    ];
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
        const extracted = extractContentGeometry(
          inflate(content, "page content"),
          fonts,
          pageIndex,
        );
        textRuns.push(...extracted.runs);
        for (const figure of extracted.figures) {
          const { minX, minY, maxX, maxY, paintMinX, paintMinY, paintMaxX, paintMaxY } =
            figure.box;
          // 空 span（无任何路径点/文本）登记零包围盒，不输出 Infinity。
          const empty = !Number.isFinite(minX);
          const paintEmpty = !Number.isFinite(paintMinX);
          figureSpans.push({
            pageIndex,
            mcid: figure.mcid,
            bbox: Object.freeze({
              x: empty ? 0 : minX,
              y: empty ? 0 : maxY,
              width: empty ? 0 : maxX - minX,
              height: empty ? 0 : maxY - minY,
            }),
            paintBBox: Object.freeze({
              x: paintEmpty ? 0 : paintMinX,
              y: paintEmpty ? 0 : paintMaxY,
              width: paintEmpty ? 0 : paintMaxX - paintMinX,
              height: paintEmpty ? 0 : paintMaxY - paintMinY,
            }),
          });
        }
      }
    }
  }

  // 结构树 join：叶子 /S /Figure（/K 数字 + /Pg）→ altLong；/P 链上首个 /Alt → altShort。
  const leafAlts = new Map<
    string,
    { altLong: string | null; parentId: number | null }
  >();
  for (const [, elem] of structElems) {
    if (!elem.isFigure || elem.leafMcid === null || elem.pageId === null) {
      continue;
    }
    const pageIndex = pageIndexById.get(elem.pageId);
    if (pageIndex === undefined) {
      continue;
    }
    leafAlts.set(`${pageIndex}:${elem.leafMcid}`, {
      altLong: elem.alt,
      parentId: elem.parentId,
    });
  }
  const altShortOf = (parentId: number | null): string | null => {
    let current = parentId;
    while (current !== null) {
      const elem = structElems.get(current);
      if (elem === undefined) {
        return null;
      }
      if (elem.alt !== null) {
        return elem.alt;
      }
      current = elem.parentId;
    }
    return null;
  };
  const figures: GeometryFigure[] = [];
  const matched = new Set<string>();
  for (const span of figureSpans) {
    const key = `${span.pageIndex}:${span.mcid}`;
    const leaf = leafAlts.get(key);
    matched.add(key);
    figures.push(
      Object.freeze({
        pageIndex: span.pageIndex,
        mcid: span.mcid,
        bbox: span.bbox,
        paintBBox: span.paintBBox,
        altShort: leaf === undefined ? null : altShortOf(leaf.parentId),
        altLong: leaf === undefined ? null : leaf.altLong,
      }),
    );
  }
  // 结构树叶子无对应 span：仍是提取事实而非错误，以零包围盒登记。
  for (const [key, leaf] of leafAlts) {
    if (matched.has(key)) {
      continue;
    }
    const [pageRaw, mcidRaw] = key.split(":");
    figures.push(
      Object.freeze({
        pageIndex: Number(pageRaw),
        mcid: Number(mcidRaw),
        bbox: Object.freeze({ x: 0, y: 0, width: 0, height: 0 }),
        paintBBox: Object.freeze({ x: 0, y: 0, width: 0, height: 0 }),
        altShort: altShortOf(leaf.parentId),
        altLong: leaf.altLong,
      }),
    );
  }
  figures.sort((a, b) => a.pageIndex - b.pageIndex || a.mcid - b.mcid);
  return Object.freeze({
    pages: Object.freeze(pages),
    textRuns: Object.freeze(textRuns),
    figures: Object.freeze(figures),
  });
}
