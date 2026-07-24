import type { Block, WenshuDocument } from "@wenshu/document-model";

/** 全部文本经实体转义进入 HTML；v0 文档没有也不允许原始 HTML 注入。 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderList(
  items: readonly { readonly text: string }[],
  ordered: boolean,
): string {
  const tag = ordered ? "ol" : "ul";
  const entries = items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("");
  return `<${tag}>${entries}</${tag}>`;
}

function renderBlocks(
  blocks: readonly Block[],
  assets: WenshuDocument["assets"],
): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "section": {
        // 文档标题占 h1，章节标题从 h2 起，标题层级不跳级。
        const level = Math.min(block.level + 1, 6);
        const heading = `<h${level} id="${escapeHtml(block.id)}">${escapeHtml(block.title)}</h${level}>`;
        const children = renderBlocks(block.children, assets);
        parts.push(
          `<section aria-labelledby="${escapeHtml(block.id)}">${heading}${children}</section>`,
        );
        break;
      }
      case "paragraph":
        parts.push(`<p>${escapeHtml(block.text)}</p>`);
        break;
      case "quote": {
        const attribution =
          block.attribution === undefined
            ? ""
            : `<footer><cite>${escapeHtml(block.attribution)}</cite></footer>`;
        parts.push(
          `<blockquote><p>${escapeHtml(block.text)}</p>${attribution}</blockquote>`,
        );
        break;
      }
      case "list":
        parts.push(renderList(block.items, block.ordered));
        break;
      case "table": {
        const head = block.columns
          .map(
            (column) =>
              `<th scope="col" data-align="${column.align}">${escapeHtml(column.header)}</th>`,
          )
          .join("");
        const rows = block.rows
          .map((row) => {
            // 契约保证每行恰好覆盖全部已声明列，单元格序号即列序号。
            const cells = row.cells
              .map(
                (cell, cellIndex) =>
                  `<td data-align="${block.columns[cellIndex]?.align ?? "start"}">${escapeHtml(cell.text)}</td>`,
              )
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");
        parts.push(
          `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
        );
        break;
      }
      case "figure": {
        const asset = assets.find((candidate) => candidate.id === block.assetId);
        if (asset === undefined) {
          throw new Error(`figure references unknown asset: ${block.assetId}`);
        }
        parts.push(
          `<figure><img src="${escapeHtml(asset.path)}" alt="${escapeHtml(block.altText)}"><figcaption>${escapeHtml(block.altText)}</figcaption></figure>`,
        );
        break;
      }
      case "pageBreak":
        parts.push(
          `<div class="page-break" role="separator" data-reason="${escapeHtml(block.reason)}"></div>`,
        );
        break;
    }
  }
  return parts.join("");
}

/** 语义 HTML：标题层级、表格 scope、figure/figcaption 关联、引用出处；不含任何表现层 CSS（PA-04）。 */
export function renderDocumentHtml(document: WenshuDocument): string {
  const body = renderBlocks(document.blocks, document.assets);
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(document.language)}">`,
    `<head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title></head>`,
    "<body>",
    `<main data-document-id="${escapeHtml(document.documentId)}" data-revision="${document.revision}">`,
    `<header><h1>${escapeHtml(document.title)}</h1></header>`,
    body,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

/** 文档文本节点序列（与渲染 DOM 文本逐字对账的期望值，承接 PA-01 对账口径）。 */
export function documentTextSequence(document: WenshuDocument): string[] {
  const sequence: string[] = [document.title];
  const visit = (blocks: readonly Block[]): void => {
    for (const block of blocks) {
      switch (block.type) {
        case "section":
          sequence.push(block.title);
          visit(block.children);
          break;
        case "paragraph":
        case "quote":
          sequence.push(block.text);
          if (block.type === "quote" && block.attribution !== undefined) {
            sequence.push(block.attribution);
          }
          break;
        case "list":
          for (const item of block.items) {
            sequence.push(item.text);
          }
          break;
        case "table":
          for (const column of block.columns) {
            sequence.push(column.header);
          }
          for (const row of block.rows) {
            for (const cell of row.cells) {
              sequence.push(cell.text);
            }
          }
          break;
        case "figure":
          // alt 属性与 figcaption 同源，DOM 文本只出现一次（figcaption）。
          sequence.push(block.altText);
          break;
        case "pageBreak":
          break;
      }
    }
  };
  visit(document.blocks);
  return sequence;
}
