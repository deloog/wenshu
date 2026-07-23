import assert from "node:assert/strict";
import test from "node:test";

import { validateDocument, DOCUMENT_SCHEMA_VERSION } from "@wenshu/document-model";

import { assembleDocument, parseMarkdown } from "../src/index.ts";

const SOURCE = [
  "---",
  "title: 测试报告",
  "author: 元数据不进入文档",
  "---",
  "",
  "# 一级标题",
  "",
  "段落 **粗体** 与 `代码` 混排。",
  "",
  "## 二级标题",
  "",
  "> 引用内容",
  "",
  "- 无序一",
  "- 无序二",
  "",
  "| 列 | 数 |",
  "|---|---:|",
  "| a | 1 |",
  "",
  "[[PAGE_BREAK]]",
  "",
  "[[TOC]]",
].join("\n");

function build() {
  const parsed = parseMarkdown(SOURCE);
  return { parsed, document: assembleDocument(parsed, [], []) };
}

test("assembled document satisfies the frozen v0.1.0 contract", () => {
  const { document } = build();
  assert.equal(document.schemaVersion, DOCUMENT_SCHEMA_VERSION);
  const result = validateDocument(document);
  assert.ok(result.ok);
  assert.equal(document.title, "测试报告");
  assert.equal(document.language, "zh-CN");
});

test("stable ids are deterministic and unique even with repeated content", () => {
  const first = build().document;
  const second = build().document;
  assert.deepEqual(second, first);
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      if (typeof record["id"] === "string") {
        assert.equal(ids.has(record["id"]), false, `duplicate id ${record["id"]}`);
        ids.add(record["id"]);
      }
      Object.values(record).forEach(visit);
    }
  };
  visit(first.blocks);
  assert.ok(ids.size > 10);
});

test("inline markers are consumed as recorded syntax, content preserved", () => {
  const { parsed } = build();
  const paragraph = parsed.blocks.find((block) => block.kind === "paragraph");
  assert.equal(
    paragraph?.kind === "paragraph" && paragraph.text,
    "段落 粗体 与 代码 混排。",
  );
  const syntaxTotal = parsed.consumed.reduce((sum, line) => sum + line.syntaxChars, 0);
  const contentTotal = parsed.consumed.reduce(
    (sum, line) => sum + line.contentChars,
    0,
  );
  assert.equal(contentTotal + syntaxTotal + parsed.newlineChars, parsed.sourceChars);
});

test("nested sections and page break keep contract shape", () => {
  const { document } = build();
  const section = document.blocks[0];
  assert.equal(section?.type, "section");
  if (section?.type === "section") {
    assert.equal(section.level, 1);
    const nested = section.children.find((block) => block.type === "section");
    assert.equal(nested?.type === "section" && nested.level, 2);
  }
  const pageBreak = JSON.parse(JSON.stringify(document.blocks));
  assert.equal(JSON.stringify(pageBreak).includes('"reason":"source"'), true);
});
