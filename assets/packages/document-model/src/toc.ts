import type { Block, WenshuDocument } from "./generated/document.ts";

/** 目录块生成的固定栏目标题（generated chrome，非源文内容，但对账序列须包含）。 */
export const TOC_HEADING = "目录";

export interface TocEntry {
  readonly id: string;
  readonly title: string;
  readonly level: number;
}

/**
 * 目录收录规则（PA-11A 冻结口径，ADR-0010）：文档序收录 level 1–2 章节；
 * /blocks/0 封面题名节（根首块且标题与文档题名相同，已由 header/h1 呈现）整棵子树排除。
 * 该规则是文档语义的派生视图，渲染器与检查器共用同一真源。
 */
export function collectTocEntries(document: WenshuDocument): readonly TocEntry[] {
  const entries: TocEntry[] = [];
  const visit = (blocks: readonly Block[]): void => {
    for (const block of blocks) {
      if (block.type !== "section") {
        continue;
      }
      if (block.level <= 2) {
        entries.push(
          Object.freeze({ id: block.id, title: block.title, level: block.level }),
        );
      }
      visit(block.children);
    }
  };
  const [first, ...rest] = document.blocks;
  const coverExcluded =
    first !== undefined && first.type === "section" && first.title === document.title;
  if (!coverExcluded && first !== undefined) {
    visit([first]);
  }
  visit(rest);
  return Object.freeze(entries);
}
