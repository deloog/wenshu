/**
 * 源 SVG 固有宽高比（PA-10）：比例检查的唯一源侧事实来自源 SVG 根元素
 * viewBox（声明式固有比），禁几何启发式、禁第三方解析器（零依赖白名单
 * 解析）。解析不出合法 viewBox 时 fail-closed 返回 null——比例规则据此
 * 降人工核验，绝不猜测。
 */
const SVG_TAG_PATTERN = /<svg\b[^>]*>/u;
const VIEWBOX_PATTERN = /\bviewBox\s*=\s*"([^"]*)"/u;

export function extractSvgAspectRatio(svg: string): number | null {
  const tag = SVG_TAG_PATTERN.exec(svg);
  if (tag === null) {
    return null;
  }
  const viewBox = VIEWBOX_PATTERN.exec(tag[0]);
  if (viewBox === null) {
    return null;
  }
  const parts = viewBox[1]?.trim().split(/[\s,]+/u) ?? [];
  if (parts.length !== 4) {
    return null;
  }
  const numbers = parts.map(Number);
  const width = numbers[2];
  const height = numbers[3];
  if (
    numbers.some((value) => !Number.isFinite(value)) ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return width / height;
}
