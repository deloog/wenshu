/**
 * A-03 deterministic 30k-character workspace fixture generator (D4a). Writes
 * apps/web/test/fixtures/workspace-30k.json. Deterministic by construction:
 * same code => same bytes; regenerate with `pnpm --filter @wenshu/web
 * fixture:30k` after any intentional shape change and commit both together.
 *
 * Shape: 12 sections x (25 paragraphs x 100 chars) + lists + tables =>
 * >= 30,000 BodyText characters, ~300+ blocks, valid against the frozen
 * 0.2.0 schema (validateDocument runs before writing; fail-closed).
 */
import { mkdir, writeFile } from "node:fs/promises";

import {
  validateDocument,
  type Block,
  type WenshuDocument,
} from "@wenshu/document-model";

const id = (prefix: string, ordinal: number): string =>
  `${prefix}_${ordinal.toString(16).padStart(32, "0")}`;

const SENTENCE =
  "文枢把资料和想法变成可以交付的专业文件这一段文字用于构造三万字工作区基准样例";

function paragraphText(section: number, index: number): string {
  const prefix = `第${section + 1}章第${index + 1}段`;
  let text = prefix;
  let cursor = 0;
  while (text.length < 100) {
    text += SENTENCE[cursor % SENTENCE.length];
    cursor += 1;
  }
  return text.slice(0, 100);
}

function buildBlocks(): Block[] {
  const blocks: Block[] = [];
  let paragraphOrdinal = 0;
  let nodeOrdinal = 1;
  let itemOrdinal = 1;
  let colOrdinal = 1;
  let rowOrdinal = 1;
  let cellOrdinal = 1;
  for (let section = 0; section < 12; section += 1) {
    const children: Block[] = [];
    for (let index = 0; index < 25; index += 1) {
      paragraphOrdinal += 1;
      children.push({
        id: id("node", 1_000 + paragraphOrdinal),
        type: "paragraph",
        text: paragraphText(section, index),
      });
    }
    if (section % 2 === 0) {
      const items = Array.from({ length: 5 }, (_, itemIndex) => {
        itemOrdinal += 1;
        return {
          id: id("item", itemOrdinal),
          text: `要点${itemIndex + 1}（第${section + 1}章）`,
        };
      });
      nodeOrdinal += 1;
      children.push({
        id: id("node", 5_000 + nodeOrdinal),
        type: "list",
        ordered: false,
        items,
      });
    }
    if (section % 3 === 0) {
      const columns = Array.from({ length: 3 }, (_, columnIndex) => {
        colOrdinal += 1;
        return {
          id: id("col", colOrdinal),
          header: `栏目${columnIndex + 1}`,
          align: "start" as const,
        };
      });
      const rows = Array.from({ length: 4 }, () => {
        rowOrdinal += 1;
        return {
          id: id("row", rowOrdinal),
          cells: columns.map((column) => {
            cellOrdinal += 1;
            return { id: id("cell", cellOrdinal), columnId: column.id, text: "基准" };
          }),
        };
      });
      nodeOrdinal += 1;
      children.push({
        id: id("node", 6_000 + nodeOrdinal),
        type: "table",
        columns,
        rows,
      });
    }
    nodeOrdinal += 1;
    blocks.push({
      id: id("node", nodeOrdinal),
      type: "section",
      level: 1,
      title: `第${section + 1}章 基准章节`,
      children,
    });
  }
  return blocks;
}

const document: WenshuDocument = {
  schemaVersion: "0.2.0",
  documentId: id("doc", 0xa03),
  revision: 1,
  title: "A-03 三万字工作区基准样例",
  language: "zh-CN",
  assets: [],
  blocks: buildBlocks(),
};

const validation = validateDocument(document);
if (!validation.ok) {
  throw new Error(`generated fixture is invalid: ${validation.issues[0]?.code}`);
}

let bodyChars = 0;
const countChars = (blocks: readonly Block[]): void => {
  for (const block of blocks) {
    if (block.type === "section") countChars(block.children);
    if (block.type === "paragraph" || block.type === "quote")
      bodyChars += block.text.length;
    if (block.type === "list")
      block.items.forEach((entry) => (bodyChars += entry.text.length));
  }
};
countChars(document.blocks);
if (bodyChars < 30_000) {
  throw new Error(`fixture under budget: ${bodyChars} < 30000 chars`);
}

const target = new URL("../test/fixtures/workspace-30k.json", import.meta.url);
await mkdir(new URL("../test/fixtures/", import.meta.url), { recursive: true });
await writeFile(target, `${JSON.stringify(document, null, 1)}\n`);
console.log(
  JSON.stringify({
    fixture: "workspace-30k.json",
    bodyChars,
    topBlocks: document.blocks.length,
  }),
);
