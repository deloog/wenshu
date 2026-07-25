import { PdfExportError } from "./errors.ts";

/**
 * 打印基线（非模板内容，PA-05 装配层职责）：浏览器默认不约束 img 宽度，
 * 1200px 的冻结 SVG 会以约 600pt 溢出 469pt 版心并被裁掉右侧
 * （实测：11月 与（分钟）的文本算子被 Skia 整体丢弃）。
 * 模板 token 不覆盖图像尺寸，此规则是打印正确性底线，已书面登记。
 */
const PRINT_BASELINE_CSS = "img, svg { max-width: 100%; height: auto; }";

/**
 * 把 PA-03 语义 HTML 与 PA-04 白名单 CSS 合成为单文件打印文档：
 * 基线规则与模板 CSS 内联进 <head>（打印不依赖外部样式表请求时序），其余结构一字不改。
 */
export function composePrintDocument(semanticHtml: string, css: string): string {
  if (!semanticHtml.includes("</head>") || !semanticHtml.includes("<main")) {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      "semantic html lacks the expected head/main structure",
    );
  }
  return semanticHtml.replace(
    "</head>",
    `<style>\n${PRINT_BASELINE_CSS}\n${css}</style></head>`,
  );
}
