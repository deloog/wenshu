import { MarkdownImportError } from "./errors.ts";

export interface InlineResult {
  readonly text: string;
  /** Characters consumed as inline syntax (`**`, `*`, backticks). */
  readonly consumed: number;
}

/**
 * v0.1.0 文档模型无行内强调结构；粗体/斜体/行内代码的标记字符按
 * “已记录的语法消费”剥离（与 #、|、> 同类），文字内容完整保留。
 * 未配对标记与范围外 inline 语法（链接、图片、HTML、转义）fail-closed。
 */
export function stripInlineSyntax(raw: string, context: string): InlineResult {
  if (/!\[|\[[^\]]*\]\(|<[^>\s]+>|\\[*_`[\]]/.test(raw)) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `inline syntax outside the supported subset: ${context}`,
    );
  }
  let consumed = 0;
  let text = raw;
  const strongCount = (text.match(/\*\*/gu) ?? []).length;
  if (strongCount % 2 !== 0) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `unbalanced strong marker: ${context}`,
    );
  }
  consumed += strongCount * 2;
  text = text.replaceAll("**", "");
  const backtickCount = (text.match(/`/gu) ?? []).length;
  if (backtickCount % 2 !== 0) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `unbalanced code marker: ${context}`,
    );
  }
  consumed += backtickCount;
  text = text.replaceAll("`", "");
  const starCount = (text.match(/\*/gu) ?? []).length;
  if (starCount % 2 !== 0) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `unbalanced emphasis marker: ${context}`,
    );
  }
  consumed += starCount;
  text = text.replaceAll("*", "");
  if (text.trim().length === 0) {
    throw new MarkdownImportError(
      "IMPORT_UNSUPPORTED_SYNTAX",
      `line has no content after inline stripping: ${context}`,
    );
  }
  return Object.freeze({ text, consumed });
}
