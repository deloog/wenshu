import { TemplateCssError } from "./errors.ts";

/**
 * 值发射器：任何模板值进入 CSS 文本前必须经这里的白名单重校验，
 * 按固定 CSS 语法发射。 schema 已收窄也不盲信（纵深防御）；
 * 任何值都不可能突破其 CSS 属性上下文（;、}、url()、expression()、注释、< 均被结构排除）。
 */

/** 颜色：只发 #RRGGBB（6 位十六进制重校验，统一小写）。 */
export function emitColor(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/u.test(value)) {
    throw new TemplateCssError(
      "TEMPLATE_CSS_VALUE_INVALID",
      path,
      "color must be a 6-digit hex value",
    );
  }
  return value.toLowerCase();
}

/** 数值 + 单位（pt/mm）：有限数、范围内，按固定格式发射，无尾随零。 */
export function emitNumberUnit(
  value: unknown,
  unit: "pt" | "mm",
  path: string,
  min: number,
  max: number,
): string {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new TemplateCssError(
      "TEMPLATE_CSS_VALUE_INVALID",
      path,
      `number must be finite and within ${min}–${max}${unit}`,
    );
  }
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}${unit}`;
}

/** 无单位行距：有限正数（1–3），按固定格式发射。 */
export function emitLineHeight(value: unknown, path: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 3) {
    throw new TemplateCssError(
      "TEMPLATE_CSS_VALUE_INVALID",
      path,
      "line height must be a finite number within 1–3",
    );
  }
  return String(Math.round(value * 1000) / 1000);
}

/** 字体注册名：只允许字母/数字/空格/点/连字符，发射时固定加引号。 */
export function emitFamilyName(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 .-]*$/u.test(value)) {
    throw new TemplateCssError(
      "TEMPLATE_CSS_FONT_INVALID",
      path,
      "font family name uses characters outside the approved vocabulary",
    );
  }
  return `"${value}"`;
}

/** 字体文件 URL：只允许项目内相对路径片段，禁止协议、反斜杠与越级。 */
export function emitFontUrl(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) ||
    value.includes("..") ||
    value.includes(":") ||
    value.startsWith("/")
  ) {
    throw new TemplateCssError(
      "TEMPLATE_CSS_FONT_INVALID",
      path,
      "font url must be a safe relative path",
    );
  }
  return `url("${value}")`;
}

/** 枚举方向：只发 portrait/landscape。 */
export function emitOrientation(
  value: unknown,
  path: string,
): "portrait" | "landscape" {
  if (value !== "portrait" && value !== "landscape") {
    throw new TemplateCssError(
      "TEMPLATE_CSS_VALUE_INVALID",
      path,
      "orientation must be portrait or landscape",
    );
  }
  return value;
}
