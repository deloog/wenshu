import { MarkdownImportError } from "./errors.ts";

export interface FrontMatterResult {
  readonly metadata: Readonly<Record<string, string>>;
  /** Number of lines consumed (including both fences). */
  readonly consumedLines: number;
}

const ENTRY_PATTERN = /^([a-z][a-z0-9_]*): (.+)$/u;

/** YAML 子集：仅 `key: value` 平铺字符串；嵌套/列表/引号语法 fail-closed。 */
export function parseFrontMatter(lines: readonly string[]): FrontMatterResult {
  if (lines[0] !== "---") {
    throw new MarkdownImportError(
      "IMPORT_FRONTMATTER_INVALID",
      "document must start with a front matter fence",
    );
  }
  const metadata: Record<string, string> = {};
  let index = 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") {
      if (Object.keys(metadata).length === 0) {
        throw new MarkdownImportError(
          "IMPORT_FRONTMATTER_INVALID",
          "front matter must contain at least one entry",
        );
      }
      return Object.freeze({
        metadata: Object.freeze(metadata),
        consumedLines: index + 1,
      });
    }
    const match = ENTRY_PATTERN.exec(line ?? "");
    if (match === null || match[1] === undefined || match[2] === undefined) {
      throw new MarkdownImportError(
        "IMPORT_FRONTMATTER_INVALID",
        "front matter entry must be a flat key: value string",
      );
    }
    const [, key, value] = match;
    if (key in metadata) {
      throw new MarkdownImportError(
        "IMPORT_FRONTMATTER_INVALID",
        "front matter keys must be unique",
      );
    }
    metadata[key] = value;
  }
  throw new MarkdownImportError(
    "IMPORT_FRONTMATTER_INVALID",
    "front matter fence is not closed",
  );
}
