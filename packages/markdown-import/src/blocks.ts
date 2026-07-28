import { MarkdownImportError } from "./errors.ts";
import { stripInlineSyntax } from "./inline.ts";

export type IntermediateBlock =
  | { readonly kind: "heading"; readonly level: number; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "quote"; readonly text: string }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly string[];
    }
  | {
      readonly kind: "table";
      readonly columns: readonly { readonly header: string; readonly align: string }[];
      readonly rows: readonly (readonly string[])[];
    }
  | { readonly kind: "figure"; readonly alt: string; readonly source: string }
  | { readonly kind: "pageBreak" }
  | { readonly kind: "toc" };

export interface LineConsumption {
  readonly syntaxChars: number;
  readonly contentChars: number;
}

export function classifyHeading(
  line: string,
  context: string,
): { level: number; text: string; consumption: LineConsumption } | undefined {
  const match = /^(#{1,3}) (.+)$/.exec(line);
  if (match === null) {
    if (/^#{1,6}/u.test(line)) {
      throw new MarkdownImportError(
        "IMPORT_UNSUPPORTED_SYNTAX",
        `heading depth outside the supported subset: ${context}`,
      );
    }
    return undefined;
  }
  const marks = match[1] ?? "";
  const raw = match[2] ?? "";
  const inline = stripInlineSyntax(raw, context);
  return {
    level: marks.length,
    text: inline.text,
    consumption: {
      syntaxChars: marks.length + 1 + inline.consumed,
      contentChars: inline.text.length,
    },
  };
}

export function classifyListItem(
  line: string,
): { ordered: boolean; markerLength: number; raw: string } | undefined {
  const unordered = /^(- )(.+)$/u.exec(line);
  if (unordered !== null) {
    return { ordered: false, markerLength: 2, raw: unordered[2] ?? "" };
  }
  const ordered = /^(\d{1,2})\. (.+)$/u.exec(line);
  if (ordered !== null) {
    return {
      ordered: true,
      markerLength: (ordered[1] ?? "").length + 2,
      raw: ordered[2] ?? "",
    };
  }
  return undefined;
}

export function isQuoteLine(line: string): boolean {
  return line === ">" || line.startsWith("> ");
}

export function quoteContent(line: string): string {
  return line === ">" ? "" : line.slice(2);
}

export function isTableLine(line: string): boolean {
  return line.startsWith("|");
}

function splitCells(line: string, context: string): string[] {
  if (line.includes("\\|")) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `escaped pipe outside the supported subset: ${context}`,
    );
  }
  return line.replace(/^\|/u, "").replace(/\|$/u, "").split("|");
}

export function parseTable(
  lines: readonly string[],
  context: string,
): { block: IntermediateBlock; consumptions: readonly LineConsumption[] } {
  if (lines.length < 3) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `table needs a header, a delimiter, and at least one row: ${context}`,
    );
  }
  const headerLine = lines[0] ?? "";
  const delimiterLine = lines[1] ?? "";
  const headers = splitCells(headerLine, context).map((cell) =>
    stripInlineSyntax(cell.trim(), context),
  );
  const delimiters = splitCells(delimiterLine, context).map((cell) => cell.trim());
  if (
    headers.length === 0 ||
    delimiters.length !== headers.length ||
    !delimiters.every((cell) => /^:?-{3,}:?$/u.test(cell))
  ) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `table delimiter row is invalid: ${context}`,
    );
  }
  const columns = headers.map((cell, index) => {
    const delimiter = delimiters[index] ?? "";
    const align = delimiter.startsWith(":")
      ? delimiter.endsWith(":")
        ? "center"
        : "start"
      : delimiter.endsWith(":")
        ? "end"
        : "start";
    return { header: cell.text, align };
  });
  const rows: string[][] = [];
  const consumptions: LineConsumption[] = [
    {
      syntaxChars:
        headerLine.length - headers.reduce((sum, c) => sum + c.text.length, 0),
      contentChars: headers.reduce((sum, c) => sum + c.text.length, 0),
    },
    { syntaxChars: delimiterLine.length, contentChars: 0 },
  ];
  for (const rowLine of lines.slice(2)) {
    const cells = splitCells(rowLine, context).map((cell) =>
      stripInlineSyntax(cell.trim(), context),
    );
    if (cells.length !== columns.length) {
      throw new MarkdownImportError(
        "IMPORT_UNSUPPORTED_SYNTAX",
        `table row does not cover every column: ${context}`,
      );
    }
    rows.push(cells.map((cell) => cell.text));
    consumptions.push({
      syntaxChars: rowLine.length - cells.reduce((sum, c) => sum + c.text.length, 0),
      contentChars: cells.reduce((sum, c) => sum + c.text.length, 0),
    });
  }
  return {
    block: { kind: "table", columns, rows },
    consumptions: Object.freeze(consumptions),
  };
}

const FIGURE_PATTERN = /^!\[([^\]]*)\]\(([^)\s]+)\)$/u;

export function classifyFigure(
  line: string,
  context: string,
): { alt: string; source: string; consumption: LineConsumption } | undefined {
  const match = FIGURE_PATTERN.exec(line);
  if (match === null) {
    return undefined;
  }
  const rawAlt = match[1] ?? "";
  const source = match[2] ?? "";
  if (/^[a-z][a-z0-9+.-]*:/iu.test(source)) {
    throw new MarkdownImportError(
      "IMPORT_REMOTE_REF",
      `remote asset references are rejected; download the file and import it locally: ${context}`,
    );
  }
  const inline = stripInlineSyntax(rawAlt, context);
  return {
    alt: inline.text,
    source,
    consumption: {
      syntaxChars: line.length - inline.text.length,
      contentChars: inline.text.length,
    },
  };
}

export function assertNotUnsupported(line: string, context: string): void {
  if (
    line.startsWith("```") ||
    line.startsWith("<") ||
    /^ {1,}\S/u.test(line) ||
    /^(={3,}|-{3,}|\*{3,})$/u.test(line.trim())
  ) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `syntax outside the supported subset: ${context}`,
    );
  }
}
