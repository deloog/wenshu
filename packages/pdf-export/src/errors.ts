export type PdfExportCode =
  | "PDF_EXPORT_BACKFILL_FAILED"
  | "PDF_EXPORT_CANCELLED"
  | "PDF_EXPORT_COMPOSE_INVALID"
  | "PDF_EXPORT_INCREMENTAL_FALLBACK"
  | "PDF_EXPORT_METADATA_POLICY"
  | "PDF_EXPORT_PAGINATION_FAILED"
  | "PDF_EXPORT_RECONCILE_FAILED"
  | "PDF_EXPORT_STAMP_FAILED"
  | "PDF_INSPECT_UNSUPPORTED";

/** 诊断只携带稳定 code，不回显文档正文或模板字段值。 */
export class PdfExportError extends Error {
  public readonly code: PdfExportCode;

  public constructor(code: PdfExportCode, message: string) {
    super(message);
    this.name = "PdfExportError";
    this.code = code;
  }
}
