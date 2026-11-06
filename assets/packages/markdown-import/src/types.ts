import type { WenshuDocument } from "@wenshu/document-model";

export interface ConsumedLine {
  readonly line: number;
  readonly kind:
    | "blank"
    | "frontmatter-fence"
    | "frontmatter-entry"
    | "heading"
    | "paragraph"
    | "quote"
    | "list-item"
    | "table-row"
    | "table-delimiter"
    | "figure"
    | "marker-page-break"
    | "marker-toc";
  /** Characters of the raw line that are structural syntax, not content. */
  readonly syntaxChars: number;
  /** Characters of the raw line that became document content. */
  readonly contentChars: number;
}

export interface ImportReconciliation {
  readonly sourceChars: number;
  readonly newlineChars: number;
  readonly contentChars: number;
  readonly syntaxChars: number;
  readonly lines: readonly ConsumedLine[];
  readonly counts: Readonly<Record<string, number>>;
}

export interface ImportResult {
  readonly document: WenshuDocument;
  readonly reconciliation: ImportReconciliation;
  /** original reference -> normalized asset path (PA-00 provenance). */
  readonly renames: Readonly<Record<string, string>>;
  /** front matter 元数据（PA-11A：页眉 short_title 等声明值；不进文档正文）。 */
  readonly metadata: Readonly<Record<string, string>>;
}
