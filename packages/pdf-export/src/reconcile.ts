import type { Block, WenshuDocument } from "@wenshu/document-model";

import { PdfExportError } from "./errors.ts";

/**
 * Skia 文本层把部分共享字形映射到康熙部首码位；其中少数部首 NFKC 无分解，
 * 这里显式补充（只收管线实测形态，新形态会让对账失败——可信失败）。
 */
const RADICAL_SUPPLEMENT: ReadonlyMap<number, string> = new Map([
  [0x2ed3, "长"],
  [0x2edb, "风"],
  [0x2eda, "页"],
]);

/**
 * PDF 文本归一：显式部首补充表 + NFKC（部首/合字/全角归位）
 * + 去布局空白与 Cf 格式字符（Skia 的 ActualText 残留 U+FEFF 等）。
 */
export function normalizePdfText(text: string): string {
  const supplemented = [...text]
    .map((char) => RADICAL_SUPPLEMENT.get(char.codePointAt(0) ?? 0) ?? char)
    .join("");
  return supplemented
    .normalize("NFKC")
    .replaceAll(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/gu, "")
    .replaceAll(/\s+/gu, "");
}

interface SvgTextItem {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

function unescapeXml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

/**
 * 提取冻结 SVG 资产的可见文本，按 PDF 设备空间阅读序（y 升序、x 升序）排列——
 * 与位置感知提取器对图表区的排序口径一致（外层 cm 翻转使 SVG y 升序 ≈ 设备 y 降序）。
 */
export function extractSvgText(svg: string): string {
  const items: SvgTextItem[] = [];
  for (const match of svg.matchAll(
    /<text\b[^>]*?\bx="(-?[\d.]+)"[^>]*?\by="(-?[\d.]+)"[^>]*>([^<]*)<\/text>/g,
  )) {
    items.push(
      Object.freeze({
        x: Number(match[1]),
        y: Number(match[2]),
        text: unescapeXml(match[3] ?? ""),
      }),
    );
  }
  const sorted = [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  return sorted.map((item) => item.text).join("");
}

function visitBlocks(
  blocks: readonly Block[],
  parts: string[],
  figureSvgTexts: readonly string[],
  figureIndex: { value: number },
  repeatables?: string[],
  toc?: TocExpectation,
): void {
  for (const block of blocks) {
    switch (block.type) {
      case "section":
        parts.push(block.title);
        visitBlocks(
          block.children,
          parts,
          figureSvgTexts,
          figureIndex,
          repeatables,
          toc,
        );
        break;
      case "paragraph":
      case "quote":
        parts.push(block.text);
        if (block.type === "quote" && block.attribution !== undefined) {
          parts.push(block.attribution);
        }
        break;
      case "list":
        // 有序列表的 "N." 标记由渲染器（CSS ::marker）生成，进入 PDF 文本层。
        block.items.forEach((item, index) => {
          if (block.ordered) {
            parts.push(`${index + 1}.`);
          }
          parts.push(item.text);
        });
        break;
      case "table":
        for (const column of block.columns) {
          parts.push(column.header);
        }
        repeatables?.push(block.columns.map((column) => column.header).join(""));
        for (const row of block.rows) {
          for (const cell of row.cells) {
            parts.push(cell.text);
          }
        }
        break;
      case "figure": {
        // 阅读序：img（SVG 内嵌文本）先于 figcaption（altText）。
        parts.push(figureSvgTexts[figureIndex.value] ?? "");
        parts.push(block.altText);
        figureIndex.value += 1;
        break;
      }
      case "pageBreak":
        break;
      case "toc": {
        // 目录（PA-11A）：栏目标题 + 有序列表标记 + 条目标题 + 实测物理页码。
        // 页码只能来自两遍渲染测量（禁手写）；缺测量表即 fail-closed。
        if (toc === undefined) {
          throw new PdfExportError(
            "PDF_EXPORT_PAGINATION_FAILED",
            "toc block requires measured page numbers",
          );
        }
        toc.entries.forEach((entry, index) => {
          const page = toc.pages.get(entry.id);
          if (page === undefined) {
            throw new PdfExportError(
              "PDF_EXPORT_PAGINATION_FAILED",
              "toc entry lacks a measured page number",
            );
          }
          if (index === 0) {
            parts.push(toc.heading);
          }
          parts.push(`${index + 1}.`);
          parts.push(entry.title);
          parts.push(`${page}`);
        });
        break;
      }
    }
  }
}

export interface ExpectedPdfText {
  readonly text: string;
  /** 跨页时 CSS table-header-group 会重绘的表头串（渲染器生成，对账时按重复区跳过）。 */
  readonly repeatables: readonly string[];
}

/**
 * 目录期望（PA-11A）：栏目标题、收录条目（document-model 收录规则）与
 * 两遍渲染实测页码由调用方装配注入——本模块保持自包含（PA-F3 变异机制
 * 以临时副本导入本文件，不得新增运行时跨包依赖）。
 */
export interface TocExpectation {
  readonly heading: string;
  readonly entries: readonly { readonly id: string; readonly title: string }[];
  readonly pages: ReadonlyMap<string, number>;
}

/**
 * PDF 对账期望文本（承接 PA-01/PA-03 口径）：
 * 文档文本序列 + 有序列表渲染标记 + 冻结 SVG 资产的内嵌文本（SHA-256 已锚）
 * + 目录块（PA-11A：栏目标题/条目/实测页码，页码来自两遍渲染测量）。
 * 表格表头单列 repeatables：跨页重绘属排版器设计行为，不计入源文本重复。
 */
export function buildExpectedPdfText(
  document: WenshuDocument,
  figureSvgTexts: readonly string[],
  toc?: TocExpectation,
): ExpectedPdfText {
  const parts: string[] = [document.title];
  const repeatables: string[] = [];
  visitBlocks(document.blocks, parts, figureSvgTexts, { value: 0 }, repeatables, toc);
  return Object.freeze({
    text: parts.join(""),
    repeatables: Object.freeze(repeatables),
  });
}

/** 逐字对账：不一致即失败，只报位置与长度，不回显正文。 */
const FORMAT_CHARS_STRIP = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/gu;

/** 与 cmap-repair 对齐器一致的字符归一（供重复区匹配）。 */
function alignNormalizeChar(char: string): string {
  const codePoint = char.codePointAt(0) ?? 0;
  const radical = RADICAL_SUPPLEMENT.get(codePoint);
  if (radical !== undefined) {
    return radical;
  }
  return char.normalize("NFKC");
}

/** 渲染器重绘表头跳过区：首个出现保留，后续出现的 [from, to) 区间。 */
export function computeRepeatSkipSpans(
  actual: readonly string[],
  repeatables: readonly string[],
): ReadonlyMap<number, number> {
  const spans = new Map<number, number>();
  for (const repeatable of repeatables) {
    const needle = [...repeatable]
      .filter((char) => !/\s/u.test(char) && !FORMAT_CHARS_STRIP.test(char))
      .map((char) => alignNormalizeChar(char));
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
        if (/\s/u.test(char) || FORMAT_CHARS_STRIP.test(char)) {
          i += 1;
          continue;
        }
        if (alignNormalizeChar(char) !== needle[j]) {
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
    for (const [from, to] of occurrences.slice(1)) {
      spans.set(from, to);
    }
  }
  return spans;
}

/** 逐字对账：不一致即失败，只报位置与长度，不回显正文。 */
export function assertPdfReconciled(
  extracted: string,
  expected: string,
  repeatables: readonly string[] = [],
): void {
  let actualText = extracted;
  if (repeatables.length > 0) {
    const spans = computeRepeatSkipSpans([...extracted], repeatables);
    const chars = [...actualText];
    const skips = [...spans.entries()].sort((a, b) => b[0] - a[0]);
    for (const [from, to] of skips) {
      chars.splice(from, to - from);
    }
    actualText = chars.join("");
  }
  const actual = normalizePdfText(actualText);
  const want = normalizePdfText(expected);
  if (actual === want) {
    return;
  }
  let index = 0;
  while (
    index < Math.min(actual.length, want.length) &&
    actual[index] === want[index]
  ) {
    index += 1;
  }
  throw new PdfExportError(
    "PDF_EXPORT_RECONCILE_FAILED",
    `pdf text does not reconcile (first diff at ${index}, extracted ${actual.length} chars, expected ${want.length} chars)`,
  );
}
