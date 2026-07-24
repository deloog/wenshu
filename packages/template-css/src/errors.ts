export type TemplateCssCode =
  "TEMPLATE_CSS_VALUE_INVALID" | "TEMPLATE_CSS_FONT_INVALID";

/** 诊断只携带稳定 code 与 JSON 路径，不回显字段值。 */
export class TemplateCssError extends Error {
  public readonly code: TemplateCssCode;
  public readonly path: string;

  public constructor(code: TemplateCssCode, path: string, message: string) {
    super(message);
    this.name = "TemplateCssError";
    this.code = code;
    this.path = path;
  }
}
