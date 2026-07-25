/**
 * 文档 → 逐块期望段：P0 内容缺失检查的文档侧期望（PA-05 整串对账只有首
 * diff，本模块提供块粒度定位）。遍历规则镜像 pdf-export reconcile 的
 * visitBlocks（含有序列表渲染标记、表格表头 repeatables、figure 内嵌 SVG
 * 文本先于题注）；归一复用 PA-05 的 normalizePdfText 口径。
 * PA-08 增 kind：P1 规则按块类分域（标题/正文段落/表格/图片各归各的
 * 检查域），P0 规则不消费 kind。
 */
import type { Block, WenshuDocument } from "@wenshu/document-model";
import { normalizePdfText } from "@wenshu/pdf-export";

/** 期望块类别：P1 分域检查的事实来源（文档侧语义，非几何启发式）。 */
export type ExpectedBlockKind =
  | "cover-title"
  | "section-title"
  | "paragraph"
  | "quote"
  | "quote-attribution"
  | "list-marker"
  | "list-item"
  | "table-header"
  | "table-header-group"
  | "table-cell"
  | "figure-svg"
  | "figure-caption";

export interface ExpectedBlock {
  /** 稳定块定位：`/title`、`/blocks/<i>`、子路径 `/blocks/<i>/rows/<r>/cells/<c>` 等。 */
  readonly ref: string;
  /** 归一后的期望文本（PA-05 口径：部首→CJK、NFKC、去空白/Cf）。 */
  readonly text: string;
  /** 渲染器跨页重绘内容（表头）：接受至少一次出现，而非恰好一次。 */
  readonly repeatable: boolean;
  /** 块类别（PA-08 起；表格/图片块由 PA-09/10 消费，P1 仅标题与正文段落）。 */
  readonly kind: ExpectedBlockKind;
}

function pushBlock(
  out: ExpectedBlock[],
  ref: string,
  rawText: string,
  repeatable: boolean,
  kind: ExpectedBlockKind,
): void {
  const text = normalizePdfText(rawText);
  if (text.length === 0) {
    return;
  }
  out.push(Object.freeze({ ref, text, repeatable, kind }));
}

function visitBlocks(
  blocks: readonly Block[],
  path: string,
  figureSvgTexts: readonly string[],
  figureIndex: { value: number },
  out: ExpectedBlock[],
): void {
  blocks.forEach((block, index) => {
    const ref = `${path}/${index}`;
    switch (block.type) {
      case "section":
        pushBlock(out, ref, block.title, false, "section-title");
        visitBlocks(
          block.children,
          `${ref}/children`,
          figureSvgTexts,
          figureIndex,
          out,
        );
        break;
      case "paragraph":
        pushBlock(out, ref, block.text, false, "paragraph");
        break;
      case "quote":
        pushBlock(out, ref, block.text, false, "quote");
        if (block.attribution !== undefined) {
          pushBlock(
            out,
            `${ref}/attribution`,
            block.attribution,
            false,
            "quote-attribution",
          );
        }
        break;
      case "list":
        block.items.forEach((item, itemIndex) => {
          if (block.ordered) {
            // 有序列表的 "N." 标记由渲染器（CSS ::marker）生成，进入 PDF 文本层。
            pushBlock(
              out,
              `${ref}/items/${itemIndex}/marker`,
              `${itemIndex + 1}.`,
              false,
              "list-marker",
            );
          }
          pushBlock(out, `${ref}/items/${itemIndex}`, item.text, false, "list-item");
        });
        break;
      case "table":
        block.columns.forEach((column, columnIndex) => {
          pushBlock(
            out,
            `${ref}/columns/${columnIndex}/header`,
            column.header,
            false,
            "table-header",
          );
        });
        // 跨页时 CSS table-header-group 重绘表头（渲染器设计行为）：接受 ≥1 次出现。
        pushBlock(
          out,
          `${ref}/header-group`,
          block.columns.map((column) => column.header).join(""),
          true,
          "table-header-group",
        );
        block.rows.forEach((row, rowIndex) => {
          row.cells.forEach((cell, cellIndex) => {
            pushBlock(
              out,
              `${ref}/rows/${rowIndex}/cells/${cellIndex}`,
              cell.text,
              false,
              "table-cell",
            );
          });
        });
        break;
      case "figure": {
        // 阅读序：SVG 内嵌文本先于 figcaption（altText）。
        pushBlock(
          out,
          `${ref}/svg`,
          figureSvgTexts[figureIndex.value] ?? "",
          false,
          "figure-svg",
        );
        pushBlock(out, `${ref}/caption`, block.altText, false, "figure-caption");
        figureIndex.value += 1;
        break;
      }
      case "pageBreak":
        break;
    }
  });
}

export function buildExpectedBlocks(
  document: WenshuDocument,
  figureSvgTexts: readonly string[],
): readonly ExpectedBlock[] {
  const out: ExpectedBlock[] = [];
  pushBlock(out, "/title", document.title, false, "cover-title");
  visitBlocks(document.blocks, "/blocks", figureSvgTexts, { value: 0 }, out);
  return Object.freeze(out);
}
