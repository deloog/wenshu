/* Generated from schema/template.schema.json. Do not edit directly. */

export type SemanticVersion = string;
export type RequiredSection =
  "cover" | "executive_summary" | "table_of_contents" | "body" | "sources";
export type MarginMm = number;
export type Color = string;
export type ValidatorName =
  | "pdf_parseable"
  | "page_size_a4"
  | "content_complete"
  | "no_duplicate_content"
  | "no_overflow"
  | "no_overlap"
  | "toc_page_numbers_match"
  | "font_available"
  | "heading_not_last_item"
  | "heading_keep_with_next"
  | "widow_orphan_minimum"
  | "table_header_repeated"
  | "table_row_not_split"
  | "figure_with_caption"
  | "caption_with_source"
  | "sparse_page_limit";

/**
 * Version 0 declarative template contract for controlled report layout.
 */
export interface WenshuTemplate {
  dsl_version: "0.1.0";
  template_id: string;
  version: SemanticVersion;
  supported_document_schema: "wenshu.report/0.1.0";
  /**
   * @minItems 1
   * @maxItems 5
   */
  required_sections: RequiredSection[];
  page: Page;
  fonts: Fonts;
  layout_tokens: LayoutTokens;
  pagination_rules: PaginationRules;
  /**
   * @minItems 1
   * @maxItems 16
   */
  validators: ValidatorName[];
  export_profile: ExportProfile;
  /**
   * Reserved for a future version; executable migration instructions are forbidden in v0.
   *
   * @maxItems 0
   */
  migration_rules: unknown[];
}
export interface Page {
  size: "A4";
  orientation: "portrait" | "landscape";
  margin_mm: Margins;
}
export interface Margins {
  top: MarginMm;
  right: MarginMm;
  bottom: MarginMm;
  left: MarginMm;
}
export interface Fonts {
  /**
   * Logical name resolved only through the approved font registry; never a path or URL.
   */
  primary: string;
  version: string;
  /**
   * @minItems 1
   * @maxItems 5
   */
  weights: (300 | 400 | 500 | 600 | 700)[];
  fallback_policy: "fail_before_export";
}
export interface LayoutTokens {
  body_font_pt: number;
  body_line_height: number;
  paragraph_spacing_pt: number;
  h1_font_pt: number;
  h2_font_pt: number;
  h3_font_pt: number;
  caption_font_pt: number;
  table_font_pt: number;
  primary_color: Color;
  accent_color: Color;
  text_color: Color;
  muted_color: Color;
}
export interface PaginationRules {
  cover_own_page: boolean;
  toc_start_new_page: boolean;
  h1_start_new_page: boolean;
  heading_keep_with_next_lines: number;
  widows: number;
  orphans: number;
  table_repeat_header: boolean;
  table_row_break_inside: "avoid";
  figure_keep_with_caption: boolean;
  max_consecutive_sparse_pages: number;
}
export interface ExportProfile {
  format: "pdf";
  print_background: boolean;
  browser_header_footer: false;
  prefer_css_page_size: true;
  embed_fonts_when_supported: true;
}
