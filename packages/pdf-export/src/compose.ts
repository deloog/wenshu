import { PdfExportError } from "./errors.ts";

/**
 * 把 PA-03 语义 HTML 与 PA-04 白名单 CSS 合成为单文件打印文档：
 * CSS 内联进 <head>（打印不依赖外部样式表请求时序），其余结构一字不改。
 */
export function composePrintDocument(semanticHtml: string, css: string): string {
  if (!semanticHtml.includes("</head>") || !semanticHtml.includes("<main")) {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      "semantic html lacks the expected head/main structure",
    );
  }
  return semanticHtml.replace("</head>", `<style>\n${css}</style></head>`);
}
