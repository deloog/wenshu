/**
 * Alpha information architecture skeleton — verbatim mapping of the eight
 * ux-spec §3 upper-bound items plus the explicit exclusion list. This is a
 * freeze artifact, not a design system (A-01 scope ruling, ADR-0028 D2).
 */
export interface IaAreaViewModel {
  readonly id: string;
  readonly label: string;
  readonly note: string;
}

export const IA_AREAS: readonly IaAreaViewModel[] = Object.freeze([
  Object.freeze({
    id: "projects",
    label: "项目/文件夹与最近项目",
    note: "项目入口与最近项目列表骨架",
  }),
  Object.freeze({
    id: "editor",
    label: "文档编辑区",
    note: "编辑视图与页面预览明确区分（ux-spec §6）",
  }),
  Object.freeze({
    id: "ai-workspace",
    label: "AI 工作区（目标、约束、计划、diff 与裁决）",
    note: "计划不是最终结果；用户批准具体 diff（ux-spec §5）",
  }),
  Object.freeze({
    id: "preview",
    label: "页面预览与问题检查",
    note: "问题按阻断交付/建议修复/信息分级（ux-spec §6）",
  }),
  Object.freeze({
    id: "citations",
    label: "引用/出处查看",
    note: "引用与生成内容视觉可区分但不制造噪声（ux-spec §5）",
  }),
  Object.freeze({
    id: "versions",
    label: "版本历史",
    note: "自动修复保留修复前版本（ux-spec §6）",
  }),
  Object.freeze({
    id: "export",
    label: "导出与完整知识包",
    note: "默认另存成品，不覆盖导入原件（ux-spec §7）",
  }),
  Object.freeze({
    id: "settings",
    label: "设置（模型/BYOK、字体、隐私、存储）",
    note: "浏览器 Host 非持久，仅用于开发与联调（PB-10 followups #5）",
  }),
]);

/** ux-spec §3 explicit exclusions; listing them here is part of the freeze. */
export const IA_EXCLUSIONS: readonly string[] = Object.freeze([
  "知识图谱视图",
  "模板市场",
  "自动同步",
  "多端协同",
  "复杂表格",
  "PPT",
]);

export function buildShellNav(): readonly IaAreaViewModel[] {
  return IA_AREAS;
}
