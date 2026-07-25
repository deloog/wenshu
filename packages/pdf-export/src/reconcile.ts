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

/** 提取冻结 SVG 资产的可见文本（`<text>` 元素，文档序，实体反转义）。 */
export function extractSvgText(svg: string): string {
  const parts: string[] = [];
  for (const match of svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)) {
    parts.push(
      (match[1] ?? "")
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'"),
    );
  }
  return parts.join("");
}

function visitBlocks(
  blocks: readonly Block[],
  parts: string[],
  figureSvgTexts: readonly string[],
  figureIndex: { value: number },
): void {
  for (const block of blocks) {
    switch (block.type) {
      case "section":
        parts.push(block.title);
        visitBlocks(block.children, parts, figureSvgTexts, figureIndex);
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
    }
  }
}

/**
 * PDF 对账期望文本（承接 PA-01/PA-03 口径）：
 * 文档文本序列 + 有序列表渲染标记 + 冻结 SVG 资产的内嵌文本（SHA-256 已锚）。
 */
export function buildExpectedPdfText(
  document: WenshuDocument,
  figureSvgTexts: readonly string[],
): string {
  const parts: string[] = [document.title];
  visitBlocks(document.blocks, parts, figureSvgTexts, { value: 0 });
  return parts.join("");
}

/** 逐字对账：不一致即失败，只报位置与长度，不回显正文。 */
export function assertPdfReconciled(extracted: string, expected: string): void {
  const actual = normalizePdfText(extracted);
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
