import { emitFamilyName } from "@wenshu/template-css";

import { PdfExportError } from "./errors.ts";

/** 内嵌字体的 @font-face 面孔：字重 + 文件字节（data: URL 自包含）。 */
export interface EmbeddedFontFace {
  readonly weight: number;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/**
 * SVG 字体声明注入（供给期变换，冻结资产字节不变）。
 * 经 <img> 加载的 SVG 是沙箱文档，不加载外部子资源——外部 url() 字体不可达
 * （VM 实测回落 MicrosoftYaHei）。唯一自包含方案：data: URL 内嵌冻结 OTF 字节，
 * 使 SVG 文档按自身 font-family 声明使用冻结字体。
 */
export function injectSvgFontFace(
  svg: string,
  family: string,
  faces: readonly EmbeddedFontFace[],
): string {
  if (svg.includes("data-wenshu-font-inject")) {
    throw new PdfExportError(
      "PDF_EXPORT_COMPOSE_INVALID",
      "svg already carries an injected font declaration",
    );
  }
  const familyName = emitFamilyName(family, "/svg/fonts/family");
  const rules = faces
    .map((face) => {
      const dataUrl = `url("data:font/otf;base64,${Buffer.from(face.bytes).toString("base64")})`;
      return `@font-face {\n  font-family: ${familyName};\n  font-style: normal;\n  font-weight: ${face.weight};\n  src: ${dataUrl} format("opentype");\n}`;
    })
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
