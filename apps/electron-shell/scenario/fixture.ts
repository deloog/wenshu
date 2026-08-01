import type { WenshuDocument } from "@wenshu/document-model";
import type { ToolPermission } from "@wenshu/semantic-tools";

/** Deterministic hex identifiers; every ID matches its frozen schema pattern. */
function hexId(prefix: string, seed: string): string {
  return `${prefix}_${seed}${"0".repeat(32 - seed.length)}`;
}

export const DOCUMENT_ID = hexId("doc", "e2e0");
export const SECTION_ID = hexId("node", "5ec0");
export const PARAGRAPH_ONE_ID = hexId("node", "9a01");
export const PARAGRAPH_TWO_ID = hexId("node", "9a02");
export const PROJECT_ID = hexId("prj", "e2e1");
export const PACKAGE_ID = hexId("pkg", "e2e2");
export const MATERIAL_ID = hexId("mat", "e2e3");
export const INVOCATION_ID = hexId("inv", "e2e4");

export function auditEventId(ordinal: number): string {
  return hexId("audit", `e2e5${ordinal.toString(16)}`);
}

export const REWRITE_ONE_TEXT = "AI 改写后的段落一。";
export const REJECTED_INSERT_TEXT = "AI 试图插入但被拒绝的段落。";
export const REWRITE_TWO_TEXT = "AI 改写后的段落二。";

export function buildInitialDocument(): WenshuDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: DOCUMENT_ID,
    revision: 0,
    title: "PB-12 E2E 场景文档",
    language: "zh-CN",
    assets: [],
    blocks: [
      {
        id: SECTION_ID,
        type: "section",
        level: 1,
        title: "一、场景",
        children: [
          { id: PARAGRAPH_ONE_ID, type: "paragraph", text: "原始段落一：人类初稿。" },
          { id: PARAGRAPH_TWO_ID, type: "paragraph", text: "原始段落二：人类初稿。" },
        ],
      },
    ],
  };
}

/**
 * The only fake in the whole E2E: the AI plan is a scripted ToolRequest
 * sequence (PB-12 D1). Envelope shape follows decodeToolRequest.
 */
export function scriptedAiPlan(): readonly unknown[] {
  return Object.freeze([
    { tool: "rewrite", args: { nodeId: PARAGRAPH_ONE_ID, text: REWRITE_ONE_TEXT } },
    { tool: "insert", args: { parentId: SECTION_ID, text: REJECTED_INSERT_TEXT } },
    { tool: "rewrite", args: { nodeId: PARAGRAPH_TWO_ID, text: REWRITE_TWO_TEXT } },
  ]);
}

export function scriptedPermission(): ToolPermission {
  return {
    allowedTools: Object.freeze(["rewrite", "insert"]),
    writableNodeIds: Object.freeze([SECTION_ID, PARAGRAPH_ONE_ID, PARAGRAPH_TWO_ID]),
  };
}

export const MODEL_CONTEXT = Object.freeze({
  provider: "test" as const,
  model: "scripted-plan",
  invocation_id: INVOCATION_ID,
});

export const MATERIAL_MARKDOWN = "# 参考资料\nPB-12 E2E 场景材料。\n";

/**
 * Minimal real template (DSL 0.1.0), same shape the knowledge-package
 * integration suite exports.
 */
export function buildTemplate(): Record<string, unknown> {
  return {
    dsl_version: "0.1.0",
    template_id: "wenshu.minimal",
    version: "1.0.0",
    supported_document_schema: "wenshu.report/0.1.0",
    required_sections: ["body"],
    page: {
      size: "A4",
      orientation: "portrait",
      margin_mm: { top: 20, right: 18, bottom: 20, left: 18 },
    },
    fonts: {
      primary: "Source Han Sans CN",
      version: "2.005R",
      weights: [400],
      fallback_policy: "fail_before_export",
    },
    layout_tokens: {
      body_font_pt: 11,
      body_line_height: 1.55,
      paragraph_spacing_pt: 6,
      h1_font_pt: 22,
      h2_font_pt: 16,
      h3_font_pt: 13,
      caption_font_pt: 9,
      table_font_pt: 9.5,
      primary_color: "#17324D",
      accent_color: "#2E6F95",
      text_color: "#1F2933",
      muted_color: "#66737F",
    },
    pagination_rules: {
      cover_own_page: true,
      toc_start_new_page: true,
      h1_start_new_page: true,
      heading_keep_with_next_lines: 2,
      widows: 2,
      orphans: 2,
      table_repeat_header: true,
      table_row_break_inside: "avoid",
      figure_keep_with_caption: true,
      max_consecutive_sparse_pages: 1,
    },
    validators: ["pdf_parseable"],
    export_profile: {
      format: "pdf",
      print_background: true,
      browser_header_footer: false,
      prefer_css_page_size: true,
      embed_fonts_when_supported: true,
    },
    migration_rules: [],
  };
}
