import type {
  ExportProfile,
  LayoutTokens,
  Page,
  PaginationRules,
  RequiredSection,
  ValidatorName,
} from "@wenshu/template-model";

/** 经受控字体注册表解析后的字重绑定；只是逻辑身份，不是文件路径。 */
export interface ResolvedFontFace {
  readonly family: string;
  readonly version: string;
  readonly weight: number;
  readonly style: string;
  readonly postscriptName: string;
}

export interface ControlledFonts {
  readonly fallbackPolicy: "fail_before_export";
  readonly faces: readonly ResolvedFontFace[];
}

/** PA-04 解释器消费的受控模板模型：全部字段已经契约校验与绑定检查。 */
export interface ControlledTemplate {
  readonly templateId: string;
  readonly version: string;
  /** 绑定的文档契约标识（`wenshu.report/<version>`）。 */
  readonly documentSchema: string;
  readonly requiredSections: readonly RequiredSection[];
  readonly page: Page;
  readonly fonts: ControlledFonts;
  readonly layoutTokens: LayoutTokens;
  readonly paginationRules: PaginationRules;
  readonly validators: readonly ValidatorName[];
  readonly exportProfile: ExportProfile;
}

export type TemplateMapIssueCode =
  | "TEMPLATE_MAP_UNSUPPORTED_DOCUMENT_SCHEMA"
  | "TEMPLATE_MAP_FONT_UNKNOWN"
  | "TEMPLATE_MAP_FONT_WEIGHT_UNREGISTERED"
  | "TEMPLATE_MAP_FONT_REGISTRY_INVALID";

/** 稳定诊断：只有问题码与 JSON 路径，不回显字段值。 */
export interface TemplateMapIssue {
  readonly code: TemplateMapIssueCode;
  readonly path: string;
}
