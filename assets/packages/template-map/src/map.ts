import { cloneAndFreeze } from "@wenshu/contract-runtime";
import { SUPPORTED_DOCUMENT_SCHEMA_VERSIONS } from "@wenshu/document-model";
import { validateTemplate, type TemplateIssue } from "@wenshu/template-model";

import type { ApprovedFontSet } from "./font-registry.ts";
import type {
  ControlledTemplate,
  ResolvedFontFace,
  TemplateMapIssue,
  TemplateMapIssueCode,
} from "./types.ts";

export type TemplateMapResult =
  | { readonly ok: true; readonly value: ControlledTemplate }
  | {
      readonly ok: false;
      readonly issues: readonly (TemplateIssue | TemplateMapIssue)[];
    };

function failure(code: TemplateMapIssueCode, path: string): TemplateMapResult {
  return Object.freeze({
    ok: false,
    issues: Object.freeze([Object.freeze({ code, path })]),
  });
}

/**
 * 把不可信模板 JSON 映射为受控模板模型（PA-02：只做声明式绑定，不做布局/渲染）。
 * 先经 G1-05 安全校验（未知字段、DSL 版本、执行面、预算），再绑定文档契约与受控字体注册表。
 * documentSchemaVersions 默认取 document-model reader 支持集（ADR-0010 additive 纪律）；
 * 测试可注入以验证绑定守卫的决定性。
 */
export function mapTemplate(
  input: unknown,
  fontSet: ApprovedFontSet,
  documentSchemaVersions: readonly string[] = SUPPORTED_DOCUMENT_SCHEMA_VERSIONS,
): TemplateMapResult {
  const validation = validateTemplate(input);
  if (!validation.ok) {
    return Object.freeze({ ok: false, issues: validation.issues });
  }
  const template = validation.value;

  // 绑定一：模板声明的文档契约必须是 reader 实际支持的版本（0.2.0 additive 升级后
  // 仍接受冻结 0.1.0 声明；未知/未来版本精确拒绝，ADR-0010）。
  const acceptedSchemas = new Set(
    documentSchemaVersions.map((version) => `wenshu.report/${version}`),
  );
  if (!acceptedSchemas.has(template.supported_document_schema)) {
    return failure(
      "TEMPLATE_MAP_UNSUPPORTED_DOCUMENT_SCHEMA",
      "/supported_document_schema",
    );
  }

  // 绑定二：字体只是逻辑注册名，必须能解析到已批准字体清单（G1-13）。
  if (
    template.fonts.primary !== fontSet.family ||
    template.fonts.version !== fontSet.version
  ) {
    return failure("TEMPLATE_MAP_FONT_UNKNOWN", "/fonts/primary");
  }
  const faces: ResolvedFontFace[] = [];
  for (const [index, weight] of template.fonts.weights.entries()) {
    const face = fontSet.faces.find((candidate) => candidate.weight === weight);
    if (face === undefined) {
      return failure(
        "TEMPLATE_MAP_FONT_WEIGHT_UNREGISTERED",
        `/fonts/weights/${index}`,
      );
    }
    faces.push(
      Object.freeze({
        family: fontSet.family,
        version: fontSet.version,
        weight,
        style: face.style,
        postscriptName: face.postscriptName,
      }),
    );
  }

  const controlled: ControlledTemplate = {
    templateId: template.template_id,
    version: template.version,
    documentSchema: template.supported_document_schema,
    requiredSections: template.required_sections,
    page: template.page,
    fonts: Object.freeze({
      fallbackPolicy: template.fonts.fallback_policy,
      faces,
    }),
    layoutTokens: template.layout_tokens,
    paginationRules: template.pagination_rules,
    validators: template.validators,
    exportProfile: template.export_profile,
  };
  return Object.freeze({ ok: true, value: cloneAndFreeze(controlled) });
}
