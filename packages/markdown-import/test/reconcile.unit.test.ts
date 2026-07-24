import assert from "node:assert/strict";
import test from "node:test";

import type { WenshuDocument } from "@wenshu/document-model";

import {
  assembleDocument,
  buildReconciliation,
  MarkdownImportError,
  parseMarkdown,
} from "../src/index.ts";

const SOURCE = [
  "---",
  "title: 对账守卫",
  "---",
  "",
  "# 章节",
  "",
  "第一段内容。",
  "",
  "第二段内容。",
].join("\n");

function build() {
  const parsed = parseMarkdown(SOURCE);
  return { parsed, document: assembleDocument(parsed, [], [], "test.md") };
}

test("untampered document reconciles against line accounting", () => {
  const { parsed, document } = build();
  const reconciliation = buildReconciliation(parsed, document);
  assert.equal(
    reconciliation.contentChars +
      reconciliation.syntaxChars +
      reconciliation.newlineChars,
    reconciliation.sourceChars,
  );
});

test("document content drifting from line accounting fails closed", () => {
  const { parsed, document } = build();
  const section = document.blocks[0];
  assert.equal(section?.type, "section");
  if (section?.type !== "section") {
    return;
  }
  // 模拟 parse→assemble 之间的内容丢失/篡改：块文本与行账目不再一致。
  const tampered: WenshuDocument = {
    ...document,
    blocks: [
      {
        ...section,
        children: section.children.map((block) =>
          block.type === "paragraph" ? { ...block, text: `${block.text}篡改` } : block,
        ),
      },
    ],
  };
  assert.throws(
    () => buildReconciliation(parsed, tampered),
    (error: unknown) =>
      error instanceof MarkdownImportError &&
      error.code === "IMPORT_RECONCILE_FAILED" &&
      /document content/u.test(error.message),
  );
});

test("document content silently dropped from a block fails closed", () => {
  const { parsed, document } = build();
  const section = document.blocks[0];
  assert.equal(section?.type, "section");
  if (section?.type !== "section") {
    return;
  }
  const tampered: WenshuDocument = {
    ...document,
    blocks: [{ ...section, children: section.children.slice(1) }],
  };
  assert.throws(
    () => buildReconciliation(parsed, tampered),
    (error: unknown) =>
      error instanceof MarkdownImportError &&
      error.code === "IMPORT_RECONCILE_FAILED" &&
      /document content/u.test(error.message),
  );
});
