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

/** C0（保留 \t=0x09、\n=0x0A 为结构字符）、DEL、C1 与 U+2028/2029 一律拒绝。 */
function isDisallowedControl(codePoint: number): boolean {
  return (
    codePoint <= 0x08 ||
    (codePoint >= 0x0b && codePoint <= 0x1f) ||
    codePoint === 0x7f ||
    (codePoint >= 0x80 && codePoint <= 0x9f) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029
  );
}

export function parseMarkdown(source: string): ParsedSource {
  // PA-A4：前导 BOM 剥离并计入第 1 行语法消费（Windows 记事本/Excel 导出常态）；
  // 正文中间的 U+FEFF 不作特殊处理。
  const hasBom = source.startsWith("\uFEFF");
  const text = hasBom ? source.slice(1) : source;
  const segments = text.split("\n");
  const newlineChars = segments.length - 1;
  if (text.endsWith("\n")) {
    segments.pop();
  }
  // CRLF 行尾的 \r 是真实源字符，逐行剥离后计入该行的语法消费，
  // 使对账口径对 Windows 默认行尾的原始文件闭合。
  const lines: string[] = [];
  const carriageReturns: number[] = [];
  for (const segment of segments) {
    if (segment.endsWith("\r")) {
      lines.push(segment.slice(0, -1));
      carriageReturns.push(1);
    } else {
      lines.push(segment);
      carriageReturns.push(0);
    }
  }
  // PA-A8：控制字符 fail-closed。保留 \t；\n 为结构字符；行尾 \r 已在上面剥离，
  // 此处残留的 \r 必为行中孤立 \r。错误只带行号与码点，不回显正文。
  for (const [lineIndex, line] of lines.entries()) {
    for (const char of line) {
      const codePoint = char.codePointAt(0) ?? 0;
      if (!isDisallowedControl(codePoint)) {
        continue;
      }
      const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
      throw new MarkdownImportError(
        "IMPORT_UNSUPPORTED_SYNTAX",
        `control character U+${hex} is not allowed in document text: line ${lineIndex + 1}`,
      );
    }
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
      // 纯空白行是合法空行，空白字符按语法消费计入对账。
      consumed.push({
        line: lineNumber,
        kind: "blank",
        syntaxChars: line.length,
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
      blocks.push({ kind: "toc" });
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
  const accounted = consumed.map((entry) => {
    const carriage =
      (carriageReturns[entry.line - 1] ?? 0) + (entry.line === 1 && hasBom ? 1 : 0);
    return carriage === 0
      ? entry
      : { ...entry, syntaxChars: entry.syntaxChars + carriage };
  });
  return Object.freeze({
    metadata: front.metadata,
    blocks: Object.freeze(blocks),
    consumed: Object.freeze(accounted),
    newlineChars,
    sourceChars: source.length,
    embeddedBreaks,
  });
}
