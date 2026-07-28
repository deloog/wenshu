import type { TocEntry } from "@wenshu/document-model";

import { PdfExportError } from "./errors.ts";

/**
 * 打印基线（非模板内容，PA-05 装配层职责）：浏览器默认不约束 img 宽度，
 * 1200px 的冻结 SVG 会以约 600pt 溢出 469pt 版心并被裁掉右侧
 * （实测：11月 与（分钟）的文本算子被 Skia 整体丢弃）。
 * 模板 token 不覆盖图像尺寸，此规则是打印正确性底线，已书面登记。
 */
const PRINT_BASELINE_CSS = "img, svg { max-width: 100%; height: auto; }";

/**
 * 把 PA-03 语义 HTML 与 PA-04 白名单 CSS 合成为单文件打印文档。
 * SVG 经 inlineSvg 内联进 DOM：Skia 的 SVG-as-<img> 沙箱不使用任何 webfont
 * （实测主机回落 Noto、VM 回落 MicrosoftYaHei）；内联后图表文本走页面
 * @font-face（PA-04 CSS，各环境均验证使用冻结 OTF）。
 * 冻结资产字节不变，a11y 由 role="img" + aria-label 承接。
 */
export function composePrintDocument(
  semanticHtml: string,
  css: string,
  inlineSvg?: (assetPath: string) => string | undefined,
): string {
  if (!semanticHtml.includes("</head>") || !semanticHtml.includes("<main")) {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      "semantic html lacks the expected head/main structure",
    );
  }
  let documentHtml = semanticHtml.replace(
    "</head>",
    `<style>\n${PRINT_BASELINE_CSS}\n${css}</style></head>`,
  );
  if (inlineSvg !== undefined) {
    documentHtml = documentHtml.replaceAll(
      /<img src="([^"]+\.svg)" alt="([^"]*)">/gu,
      (whole, path: string, alt: string) => {
        const svg = inlineSvg(path);
        if (svg === undefined) {
          return whole;
        }
        return `<div class="fig-image" role="img" aria-label="${alt}">${svg}</div>`;
      },
    );
  }
  return documentHtml;
}

/**
 * 第二遍填充：把实测物理页码写进目录条目的占位 span。
 * 占位串由 report-render 固定生成；每条目必须恰好出现一次（防静默错位）。
 */
export function fillTocPageNumbers(
  printHtml: string,
  entries: readonly TocEntry[],
  tocPages: ReadonlyMap<string, number>,
): string {
  let filled = printHtml;
  for (const entry of entries) {
    const placeholder = `<span class="toc-entry-page" data-toc-target="${entry.id}"></span>`;
    const page = tocPages.get(entry.id);
    if (page === undefined) {
      throw new PdfExportError(
        "PDF_EXPORT_PAGINATION_FAILED",
        "toc entry lacks a measured page number",
      );
    }
    const occurrences = filled.split(placeholder).length - 1;
    if (occurrences !== 1) {
      throw new PdfExportError(
        "PDF_EXPORT_PAGINATION_FAILED",
        "toc page placeholder must appear exactly once per entry",
      );
    }
    filled = filled.replace(
      placeholder,
      `<span class="toc-entry-page" data-toc-target="${entry.id}">${page}</span>`,
    );
  }
  return filled;
}
