import { emitFamilyName } from "@wenshu/template-css";

import { PdfExportError } from "./errors.ts";
import type { FontFacePlan } from "@wenshu/report-render";

/** 根相对字体 URL（本站 /fonts/ 挂载）：禁协议、反斜杠、越级、查询串。 */
function emitRootRelativeFontUrl(value: string, path: string): string {
  if (
    typeof value !== "string" ||
    !/^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) ||
    value.includes("..")
  ) {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      `unsafe font url at ${path}`,
    );
  }
  return `url("${value}")`;
}

/**
 * SVG 字体声明注入（供给期变换，冻结资产字节不变）。
 * 经 <img> 加载的 SVG 是独立文档，看不到页面 @font-face，会回落系统字体；
 * 注入等价的 @font-face 规则后，SVG 文档自行加载冻结 OTF——
 * 这正是 SVG 自身 `font-family` 声明所要求的渲染。
 */
export function injectSvgFontFace(
  svg: string,
  family: string,
  fontBaseUrl: string,
  plan: readonly FontFacePlan[],
): string {
  if (svg.includes("data-wenshu-font-inject")) {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      "svg already carries an injected font declaration",
    );
  }
  const familyName = emitFamilyName(family, "/svg/fonts/family");
  const rules = plan
    .map(
      (face) =>
        `@font-face {\n  font-family: ${familyName};\n  font-style: normal;\n  font-weight: ${face.weight};\n  src: ${emitRootRelativeFontUrl(`${fontBaseUrl}${face.fileName}`, "/svg/fonts/src")} format("opentype");\n}`,
    )
    .join("\n");
  const style = `<style data-wenshu-font-inject="">\n${rules}\n</style>`;
  const root = /<svg\b[^>]*>/u.exec(svg);
  if (root === null) {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      "svg root element not found",
    );
  }
  const at = (root.index ?? 0) + root[0].length;
  return `${svg.slice(0, at)}\n${style}${svg.slice(at)}`;
}
