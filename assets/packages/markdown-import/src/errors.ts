export type MarkdownImportCode =
  | "IMPORT_FRONTMATTER_INVALID"
  | "IMPORT_UNSUPPORTED_SYNTAX"
  | "IMPORT_REMOTE_REF"
  | "IMPORT_ASSET_INVALID"
  | "IMPORT_ROOT_INVALID"
  | "IMPORT_RECONCILE_FAILED";

export class MarkdownImportError extends Error {
  public readonly code: MarkdownImportCode;

  public constructor(code: MarkdownImportCode, message: string) {
    super(message);
    this.name = "MarkdownImportError";
    this.code = code;
  }
}
