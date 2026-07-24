import type { ControlledTemplate } from "@wenshu/template-map";

import {
  emitColor,
  emitFamilyName,
  emitFontUrl,
  emitLineHeight,
  emitNumberUnit,
  emitOrientation,
} from "./emit.ts";
import { TemplateCssError } from "./errors.ts";

/** 一个 @font-face 来源：字重 + 项目内相对 URL（调用方从 G1-13 清单层供给）。 */
export interface CssFontFace {
  readonly weight: number;
  readonly src: string;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new TemplateCssError("TEMPLATE_CSS_VALUE_INVALID", path, "must be boolean");
  }
  return value;
}

function requireSmallInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 9) {
    throw new TemplateCssError(
      "TEMPLATE_CSS_VALUE_INVALID",
      path,
      "must be an integer within 0–9",
    );
  }
  return value;
}

/**
 * 把受控模板模型逐项白名单映射为声明式 CSS。
 * 只读白名单字段（未知/超范围 token 永不被透传）；每个值经发射器重校验；
 * 不 eval、不分页、不打印；畸形模型 fail-closed（稳定 code + 路径，不回显值）。
 */
export function renderTemplateCss(
  template: ControlledTemplate,
  fontFaces: readonly CssFontFace[],
): string {
  const tokens = template.layoutTokens;
  const rules = template.paginationRules;
  const parts: string[] = [];

  // 字体：模板绑定的字重必须逐一有来源；family 取模板绑定（全字重必须同族同版本）。
  const boundFaces = template.fonts.faces;
  const familyNames = new Set(boundFaces.map((face) => face.family));
  if (familyNames.size !== 1) {
    throw new TemplateCssError(
      "TEMPLATE_CSS_FONT_INVALID",
      "/fonts/faces",
      "all bound font faces must share one family",
    );
  }
  const family = emitFamilyName(boundFaces[0]?.family, "/fonts/faces/0/family");
  const boundWeights = new Set(boundFaces.map((face) => face.weight));
  for (const [index, face] of fontFaces.entries()) {
    if (!Number.isInteger(face.weight) || !boundWeights.has(face.weight)) {
      throw new TemplateCssError(
        "TEMPLATE_CSS_FONT_INVALID",
        `/fontFaces/${index}/weight`,
        "font face weight is not bound by the template",
      );
    }
    const src = emitFontUrl(face.src, `/fontFaces/${index}/src`);
    parts.push(
      `@font-face {\n  font-family: ${family};\n  font-style: normal;\n  font-weight: ${face.weight};\n  src: ${src} format("opentype");\n}`,
    );
  }

  // 纸张与页边距（@page：top right bottom left）。
  const orientation = emitOrientation(template.page.orientation, "/page/orientation");
  if (template.page.size !== "A4") {
    throw new TemplateCssError(
      "TEMPLATE_CSS_VALUE_INVALID",
      "/page/size",
      "only A4 is supported",
    );
  }
  const margins = template.page.margin_mm;
  const top = emitNumberUnit(margins.top, "mm", "/page/margin_mm/top", 5, 50);
  const right = emitNumberUnit(margins.right, "mm", "/page/margin_mm/right", 5, 50);
  const bottom = emitNumberUnit(margins.bottom, "mm", "/page/margin_mm/bottom", 5, 50);
  const left = emitNumberUnit(margins.left, "mm", "/page/margin_mm/left", 5, 50);
  parts.push(
    `@page {\n  size: A4 ${orientation};\n  margin: ${top} ${right} ${bottom} ${left};\n}`,
  );

  // 字级与颜色（PA-03 HTML 结构：文档标题 h1，章节层级 1–3 → h2–h4）。
  const bodySize = emitNumberUnit(
    tokens.body_font_pt,
    "pt",
    "/layoutTokens/body_font_pt",
    6,
    30,
  );
  const lineHeight = emitLineHeight(
    tokens.body_line_height,
    "/layoutTokens/body_line_height",
  );
  const textColor = emitColor(tokens.text_color, "/layoutTokens/text_color");
  const primaryColor = emitColor(tokens.primary_color, "/layoutTokens/primary_color");
  const accentColor = emitColor(tokens.accent_color, "/layoutTokens/accent_color");
  const mutedColor = emitColor(tokens.muted_color, "/layoutTokens/muted_color");
  const h1 = emitNumberUnit(tokens.h1_font_pt, "pt", "/layoutTokens/h1_font_pt", 6, 60);
  const h2 = emitNumberUnit(tokens.h2_font_pt, "pt", "/layoutTokens/h2_font_pt", 6, 48);
  const h3 = emitNumberUnit(tokens.h3_font_pt, "pt", "/layoutTokens/h3_font_pt", 6, 36);
  const caption = emitNumberUnit(
    tokens.caption_font_pt,
    "pt",
    "/layoutTokens/caption_font_pt",
    6,
    24,
  );
  const tableSize = emitNumberUnit(
    tokens.table_font_pt,
    "pt",
    "/layoutTokens/table_font_pt",
    6,
    24,
  );
  const paragraphSpacing = emitNumberUnit(
    tokens.paragraph_spacing_pt,
    "pt",
    "/layoutTokens/paragraph_spacing_pt",
    0,
    48,
  );

  parts.push(
    `body {\n  font-family: ${family};\n  font-size: ${bodySize};\n  line-height: ${lineHeight};\n  color: ${textColor};\n}`,
  );
  parts.push(`header h1 {\n  font-size: ${h1};\n  color: ${primaryColor};\n}`);
  parts.push(`main h2 {\n  font-size: ${h1};\n  color: ${primaryColor};\n}`);
  parts.push(`main h3 {\n  font-size: ${h2};\n  color: ${primaryColor};\n}`);
  parts.push(`main h4 {\n  font-size: ${h3};\n  color: ${primaryColor};\n}`);
  parts.push(`p {\n  margin: 0 0 ${paragraphSpacing} 0;\n}`);
  parts.push(`figcaption {\n  font-size: ${caption};\n  color: ${mutedColor};\n}`);
  parts.push(`table {\n  font-size: ${tableSize};\n}`);
  parts.push(`th {\n  color: ${accentColor};\n}`);

  // 保持与分页规则（CSS 分片属性；真实分页产物归 PA-05）。
  const widows = requireSmallInteger(rules.widows, "/paginationRules/widows");
  const orphans = requireSmallInteger(rules.orphans, "/paginationRules/orphans");
  parts.push(`p {\n  widows: ${widows};\n  orphans: ${orphans};\n}`);
  const keepWithNext = requireSmallInteger(
    rules.heading_keep_with_next_lines,
    "/paginationRules/heading_keep_with_next_lines",
  );
  if (keepWithNext > 0) {
    // CSS 无「保留下 N 行」等价物，最近语义为 break-after: avoid（近似已书面登记）。
    parts.push(`header h1, main h2, main h3, main h4 {\n  break-after: avoid;\n}`);
  }
  if (requireBoolean(rules.cover_own_page, "/paginationRules/cover_own_page")) {
    parts.push(`header {\n  break-after: page;\n}`);
  }
  if (requireBoolean(rules.toc_start_new_page, "/paginationRules/toc_start_new_page")) {
    parts.push(`.toc {\n  break-before: page;\n}`);
  }
  if (requireBoolean(rules.h1_start_new_page, "/paginationRules/h1_start_new_page")) {
    parts.push(`main h2 {\n  break-before: page;\n}`);
  }
  if (
    requireBoolean(rules.table_repeat_header, "/paginationRules/table_repeat_header")
  ) {
    parts.push(`thead {\n  display: table-header-group;\n}`);
  }
  if (rules.table_row_break_inside === "avoid") {
    parts.push(`tr {\n  break-inside: avoid;\n}`);
  } else if (rules.table_row_break_inside !== "auto") {
    throw new TemplateCssError(
      "TEMPLATE_CSS_VALUE_INVALID",
      "/paginationRules/table_row_break_inside",
      "must be avoid or auto",
    );
  }
  if (
    requireBoolean(
      rules.figure_keep_with_caption,
      "/paginationRules/figure_keep_with_caption",
    )
  ) {
    parts.push(`figure {\n  break-inside: avoid;\n}`);
  }
  // max_consecutive_sparse_pages 无 CSS 等价物，属 PA-05 运行时校验器，本层不发射。

  return `${parts.join("\n")}\n`;
}
