import type { WenshuDocument } from "@wenshu/document-model";

import { MarkdownImportError } from "./errors.ts";
import type { ParsedSource } from "./parser.ts";
import type { ImportReconciliation } from "./types.ts";

type JsonObject = Record<string, unknown>;

function contentCharsOfBlocks(blocks: readonly unknown[]): number {
  let total = 0;
  for (const value of blocks) {
    const block = value as JsonObject;
    switch (block["type"]) {
      case "section":
        total += String(block["title"]).length;
        total += contentCharsOfBlocks(block["children"] as unknown[]);
        break;
      case "paragraph":
      case "quote":
        total += String(block["text"]).length;
        break;
      case "list":
        for (const item of block["items"] as JsonObject[]) {
          total += String(item["text"]).length;
        }
        break;
      case "table":
        for (const column of block["columns"] as JsonObject[]) {
          total += String(column["header"]).length;
        }
        for (const row of block["rows"] as JsonObject[]) {
          for (const cell of row["cells"] as JsonObject[]) {
            total += String(cell["text"]).length;
          }
        }
        break;
      case "figure":
        total += String(block["altText"]).length;
        break;
      default:
        break;
    }
  }
  return total;
}

/** 逐资源失败收集（A-02 additive）中被排除的 figure：行在源中真实存在并被记帐，
 *  但其 alt 字符不再进入文档内容，对账时按本集合扣减，帐目保持真实闭合。 */
export interface ExcludedFigure {
  readonly alt: string;
}

/** 全文逐字归账：每个源字符要么进入文档内容，要么是记录在案的语法消费。 */
export function buildReconciliation(
  parsed: ParsedSource,
  document: WenshuDocument,
  excludedFigures: readonly ExcludedFigure[] = [],
): ImportReconciliation {
  const contentChars = parsed.consumed.reduce(
    (sum, line) => sum + line.contentChars,
    0,
  );
  const syntaxChars = parsed.consumed.reduce((sum, line) => sum + line.syntaxChars, 0);
  if (contentChars + syntaxChars + parsed.newlineChars !== parsed.sourceChars) {
    throw new MarkdownImportError(
      "IMPORT_RECONCILE_FAILED",
      "line accounting does not cover the source",
    );
  }
  const titleLength = document.title.length;
  const metadataChars = parsed.consumed
    .filter((line) => line.kind === "frontmatter-entry")
    .reduce((sum, line) => sum + line.contentChars, 0);
  const documentContentChars =
    titleLength + contentCharsOfBlocks(document.blocks as unknown[]);
  // 被排除 figure 的 alt 字符已按源行消费记帐，但不进入文档内容，此处如实扣回。
  const excludedChars = excludedFigures.reduce(
    (sum, figure) => sum + figure.alt.length,
    0,
  );
  // 段落/引用跨行合并产生的块内换行来自源换行符，不属于行内容字符。
  if (documentContentChars - parsed.embeddedBreaks + excludedChars !== contentChars) {
    throw new MarkdownImportError(
      "IMPORT_RECONCILE_FAILED",
      "document content does not match the consumed source content",
    );
  }
  if (metadataChars < titleLength) {
    throw new MarkdownImportError(
      "IMPORT_RECONCILE_FAILED",
      "front matter title is not accounted",
    );
  }
  const counts: Record<string, number> = {};
  for (const line of parsed.consumed) {
    counts[line.kind] = (counts[line.kind] ?? 0) + 1;
  }
  return Object.freeze({
    sourceChars: parsed.sourceChars,
    newlineChars: parsed.newlineChars,
    contentChars,
    syntaxChars,
    lines: parsed.consumed,
    counts: Object.freeze(counts),
  });
}
