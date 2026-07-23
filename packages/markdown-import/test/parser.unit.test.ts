import assert from "node:assert/strict";
import test from "node:test";

import {
  MarkdownImportError,
  parseFrontMatter,
  parseMarkdown,
  stripInlineSyntax,
} from "../src/index.ts";

test("inline stripping preserves content and accounts markers", () => {
  assert.deepEqual(stripInlineSyntax("**标签：** 内容 `code` 与 *强调*", "t"), {
    text: "标签： 内容 code 与 强调",
    consumed: 8,
  });
  for (const raw of ["**未闭合", "`未闭合", "*未闭合", "[链接](x)", "<b>html</b>"]) {
    assert.throws(() => stripInlineSyntax(raw, "t"), MarkdownImportError);
  }
});

test("front matter accepts flat entries and fails closed elsewhere", () => {
  const ok = parseFrontMatter(["---", "title: 标题", "author: 作者", "---", "# 正文"]);
  assert.equal(ok.consumedLines, 4);
  assert.equal(ok.metadata["title"], "标题");
  for (const lines of [
    ["title: 没有围栏", "---"],
    ["---", "title: 未闭合"],
    ["---", "---"],
    ["---", "title: 一", "title: 二", "---"],
    ["---", "nested:", "  child: x", "---"],
  ]) {
    assert.throws(() => parseFrontMatter(lines), MarkdownImportError);
  }
});

test("unsupported constructs fail closed with stable codes", () => {
  const cases = [
    ["---", "title: t", "---", "```js", "code", "```"],
    ["---", "title: t", "---", "#### 四级标题"],
    ["---", "title: t", "---", "<div>html</div>"],
    ["---", "title: t", "---", "  缩进内容"],
    ["---", "title: t", "---", "[[UNKNOWN]]"],
    ["---", "title: t", "---", "![图](https://example.com/x.png)"],
    ["---", "title: t", "---", "![图](data:image/png;base64,xx)"],
    ["---", "title: t", "---", "| a |", "|---|"],
  ];
  for (const lines of cases) {
    assert.throws(() => parseMarkdown(lines.join("\n")), MarkdownImportError);
  }
});

test("remote reference uses its dedicated code", () => {
  assert.throws(
    () =>
      parseMarkdown(["---", "title: t", "---", "![图](https://x/y.png)"].join("\n")),
    (error: unknown) =>
      error instanceof MarkdownImportError && error.code === "IMPORT_REMOTE_REF",
  );
});

test("tables parse alignment and reject ragged rows", () => {
  const parsed = parseMarkdown(
    [
      "---",
      "title: t",
      "---",
      "| 指标 | 值 |",
      "|:---|---:|",
      "| a | 1 |",
      "| b | 2 |",
    ].join("\n"),
  );
  const table = parsed.blocks[0];
  assert.equal(table?.kind, "table");
  if (table?.kind === "table") {
    assert.deepEqual(
      table.columns.map((column) => column.align),
      ["start", "end"],
    );
    assert.equal(table.rows.length, 2);
  }
  assert.throws(
    () =>
      parseMarkdown(
        ["---", "title: t", "---", "| a | b |", "|---|---|", "| only |"].join("\n"),
      ),
    MarkdownImportError,
  );
});
