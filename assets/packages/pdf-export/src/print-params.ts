import type { ControlledTemplate } from "@wenshu/template-map";

import { PdfExportError } from "./errors.ts";

const MM_PER_INCH = 25.4;
/** A4 物理尺寸（英寸）：210×297mm。 */
export const A4_WIDTH_IN = 210 / MM_PER_INCH;
export const A4_HEIGHT_IN = 297 / MM_PER_INCH;

export interface PrintParams {
  readonly paperWidth: number;
  readonly paperHeight: number;
  readonly marginTop: number;
  readonly marginRight: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly printBackground: boolean;
  readonly preferCSSPageSize: boolean;
  readonly displayHeaderFooter: boolean;
  readonly scale: number;
  readonly generateTaggedPDF: boolean;
  readonly generateDocumentOutline: boolean;
}

function mmToIn(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * 10000) / 10000;
}

/**
 * 依 export_profile 与 page 生成 CDP Page.printToPDF 参数（逐项留证、可复现）。
 * preferCSSPageSize=true 时 @page 的 size/margin 规则优先；显式参数作为一致回退。
 */
export function buildPrintParams(template: ControlledTemplate): PrintParams {
  const profile = template.exportProfile;
  if (profile.format !== "pdf") {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      "export profile format must be pdf",
    );
  }
  if (template.page.size !== "A4") {
    throw new PdfExportError("PDF_EXPORT_COMPOSE_INVALID", "only A4 is supported");
  }
  const margins = template.page.margin_mm;
  return Object.freeze({
    paperWidth: A4_WIDTH_IN,
    paperHeight: A4_HEIGHT_IN,
    marginTop: mmToIn(margins.top),
    marginRight: mmToIn(margins.right),
    marginBottom: mmToIn(margins.bottom),
    marginLeft: mmToIn(margins.left),
    printBackground: profile.print_background,
    preferCSSPageSize: profile.prefer_css_page_size,
    displayHeaderFooter: profile.browser_header_footer,
    scale: 1,
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  });
}
