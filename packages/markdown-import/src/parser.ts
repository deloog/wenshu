import { MarkdownImportError } from "./errors.ts";
import { parseFrontMatter } from "./frontmatter.ts";
import { stripInlineSyntax } from "./inline.ts";
import {
  assertNotUnsupported,
  classifyFigure,
  classifyHeading,
  classifyListItem,
  isQuoteLine,
  isTableLine,
  parseTable,
  quoteContent,
  type IntermediateBlock,
} from "./blocks.ts";
import type { ConsumedLine } from "./types.ts";

export interface ParsedSource {
  readonly metadata: Readonly<Record<string, string>>;
  readonly blocks: readonly IntermediateBlock[];
  readonly consumed: readonly ConsumedLine[];
  readonly newlineChars: number;
  readonly sourceChars: number;
  /** Newlines that became block-internal breaks (paragraph/quote joins). */
  readonly embeddedBreaks: number;
}

export function parseMarkdown(source: string): ParsedSource {
  const normalized = source.replaceAll("\r\n", "\n");
  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (trailingNewline) {
    lines.pop();
  }
  const front = parseFrontMatter(lines);
  const consumed: ConsumedLine[] = [];
  consumed.push({
    line: 1,
    kind: "frontmatter-fence",
    syntaxChars: 3,
    contentChars: 0,
  });
  for (let index = 1; index < front.consumedLines - 1; index += 1) {
    const raw = lines[index] ?? "";
    const keyLength = raw.indexOf(": ");
    const isTitle = raw.startsWith("title: ");
    // 非 title 的 front matter 值不进入文档对象，按元数据消费计入语法。
    consumed.push({
      line: index + 1,
      kind: "frontmatter-entry",
      syntaxChars: isTitle ? keyLength + 2 : raw.length,
      contentChars: isTitle ? raw.length - keyLength - 2 : 0,
    });
  }
  consumed.push({
    line: front.consumedLines,
    kind: "frontmatter-fence",
    syntaxChars: 3,
    contentChars: 0,
  });

  const blocks: IntermediateBlock[] = [];
  let embeddedBreaks = 0;
  let index = front.consumedLines;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const context = `line ${lineNumber}`;
    if (line.trim().length === 0) {
      consumed.push({
        line: lineNumber,
        kind: "blank",
        syntaxChars: 0,
        contentChars: 0,
      });
      index += 1;
      continue;
    }
    assertNotUnsupported(line, context);

    const heading = classifyHeading(line, context);
    if (heading !== undefined) {
      blocks.push({ kind: "heading", level: heading.level, text: heading.text });
      consumed.push({ line: lineNumber, kind: "heading", ...heading.consumption });
      index += 1;
      continue;
    }
    if (line === "[[PAGE_BREAK]]") {
      blocks.push({ kind: "pageBreak" });
      consumed.push({
        line: lineNumber,
        kind: "marker-page-break",
        syntaxChars: line.length,
        contentChars: 0,
      });
      index += 1;
      continue;
    }
    if (line === "[[TOC]]") {
      consumed.push({
        line: lineNumber,
        kind: "marker-toc",
        syntaxChars: line.length,
        contentChars: 0,
      });
      index += 1;
      continue;
    }
    if (line.startsWith("[[")) {
      throw new MarkdownImportError(
        "IMPORT_UNSUPPORTED_SYNTAX",
        `unknown marker: ${context}`,
      );
    }
    const figure = classifyFigure(line, context);
    if (figure !== undefined) {
      blocks.push({ kind: "figure", alt: figure.alt, source: figure.source });
      consumed.push({ line: lineNumber, kind: "figure", ...figure.consumption });
      index += 1;
      continue;
    }
    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index] ?? "")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      const table = parseTable(tableLines, context);
      blocks.push(table.block);
      table.consumptions.forEach((consumption, offset) => {
        consumed.push({
          line: lineNumber + offset,
          kind: offset === 1 ? "table-delimiter" : "table-row",
          ...consumption,
        });
      });
      continue;
    }
    if (isQuoteLine(line)) {
      const parts: string[] = [];
      while (index < lines.length && isQuoteLine(lines[index] ?? "")) {
        const quoteLine = lines[index] ?? "";
        const inline = stripInlineSyntax(quoteContent(quoteLine), context);
        parts.push(inline.text);
        consumed.push({
          line: index + 1,
          kind: "quote",
          syntaxChars: quoteLine.length - inline.text.length,
          contentChars: inline.text.length,
        });
        index += 1;
      }
      embeddedBreaks += parts.length - 1;
      blocks.push({ kind: "quote", text: parts.join("\n") });
      continue;
    }
    const listItem = classifyListItem(line);
    if (listItem !== undefined) {
      const ordered = listItem.ordered;
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index] ?? "";
        const item = classifyListItem(itemLine);
        if (item === undefined || item.ordered !== ordered) {
          break;
        }
        const inline = stripInlineSyntax(item.raw, `line ${index + 1}`);
        items.push(inline.text);
        consumed.push({
          line: index + 1,
          kind: "list-item",
          syntaxChars: itemLine.length - inline.text.length,
          contentChars: inline.text.length,
        });
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // paragraph: run of plain lines
    const parts: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index] ?? "";
      if (paragraphLine.trim().length === 0) {
        break;
      }
      if (
        classifyHeading(paragraphLine, "") !== undefined ||
        isQuoteLine(paragraphLine) ||
        isTableLine(paragraphLine) ||
        classifyListItem(paragraphLine) !== undefined ||
        classifyFigure(paragraphLine, "") !== undefined ||
        paragraphLine.startsWith("[[")
      ) {
        break;
      }
      assertNotUnsupported(paragraphLine, `line ${index + 1}`);
      const inline = stripInlineSyntax(paragraphLine, `line ${index + 1}`);
      parts.push(inline.text);
      consumed.push({
        line: index + 1,
        kind: "paragraph",
        syntaxChars: paragraphLine.length - inline.text.length,
        contentChars: inline.text.length,
      });
      index += 1;
    }
    embeddedBreaks += parts.length - 1;
    blocks.push({ kind: "paragraph", text: parts.join("\n") });
  }

  if (blocks.length === 0) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      "document body must contain at least one block",
    );
  }
  return Object.freeze({
    metadata: front.metadata,
    blocks: Object.freeze(blocks),
    consumed: Object.freeze(consumed),
    newlineChars: lines.length - 1 + (trailingNewline ? 1 : 0),
    sourceChars: normalized.length,
    embeddedBreaks,
  });
}
