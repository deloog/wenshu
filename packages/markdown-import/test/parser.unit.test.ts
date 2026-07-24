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

test("whitespace-only blank lines are consumed as syntax, not rejected", () => {
  const source = [
    "---",
    "title: t",
    "---",
    "",
    "第一段。",
    "  ",
    "\t",
    "第二段。",
  ].join("\n");
  const parsed = parseMarkdown(source);
  const rawLines = source.split("\n");
  assert.equal(parsed.consumed.filter((line) => line.kind === "blank").length, 3);
  for (const entry of parsed.consumed) {
    assert.equal(
      entry.contentChars + entry.syntaxChars,
      rawLines[entry.line - 1]?.length,
      `line ${entry.line} accounting mismatch`,
    );
  }
  const totals = parsed.consumed.reduce(
    (sum, line) => ({
      content: sum.content + line.contentChars,
      syntax: sum.syntax + line.syntaxChars,
    }),
    { content: 0, syntax: 0 },
  );
  assert.equal(
    totals.content + totals.syntax + parsed.newlineChars,
    parsed.sourceChars,
  );
});

test("CRLF sources account every carriage return as per-line syntax", () => {
  const lf = ["---", "title: t", "---", "", "第一段。", "", "第二段。"].join("\n");
  const crlf = lf.replaceAll("\n", "\r\n");
  const parsed = parseMarkdown(crlf);
  assert.equal(parsed.sourceChars, crlf.length);
  const rawLines = crlf.split("\n");
  let carriageReturns = 0;
  for (const entry of parsed.consumed) {
    const raw = rawLines[entry.line - 1];
    assert.ok(raw !== undefined);
    assert.equal(
      entry.contentChars + entry.syntaxChars,
      raw.length,
      `line ${entry.line} accounting mismatch`,
    );
    if (raw.endsWith("\r")) {
      carriageReturns += 1;
    }
  }
  assert.equal(carriageReturns, rawLines.length - 1);
  const totals = parsed.consumed.reduce(
    (sum, line) => ({
      content: sum.content + line.contentChars,
      syntax: sum.syntax + line.syntaxChars,
    }),
    { content: 0, syntax: 0 },
  );
  assert.equal(
    totals.content + totals.syntax + parsed.newlineChars,
    parsed.sourceChars,
  );
  // CRLF 与 LF 解析出同一份块结构，\r 不进入内容。
  assert.deepEqual(parsed.blocks, parseMarkdown(lf).blocks);
});

test("control characters and stray carriage returns fail closed", () => {
  // PA-A8：C0（保留 \t）/ DEL / C1 / U+2028/2029 与行中孤立 \r 一律拒绝。
  const cases: Array<[string, string]> = [
    ["第一段\u0000落", "U+0000"],
    ["\u0008退格", "U+0008"],
    ["第一\u001B段", "U+001B"],
    ["第一\u007F段", "U+007F"],
    ["第一\u0085段", "U+0085"],
    ["第一\u2028段", "U+2028"],
    ["第一\u2029段", "U+2029"],
    ["第一\r段。", "U+000D"],
  ];
  for (const [bad, codePoint] of cases) {
    assert.throws(
      () => parseMarkdown(["---", "title: t", "---", "", bad].join("\n")),
      (error: unknown) =>
        error instanceof MarkdownImportError &&
        error.code === "IMPORT_UNSUPPORTED_SYNTAX" &&
        error.message.includes(`control character ${codePoint}`) &&
        error.message.includes("line 5"),
      `expected ${codePoint} to be rejected`,
    );
  }
  // \t 显式保留并进入内容；行尾 \r（CRLF 一部分）不算孤立。
  const parsed = parseMarkdown(["---", "title: t", "---", "", "第\t一段。"].join("\n"));
  const paragraph = parsed.blocks[0];
  assert.equal(paragraph?.kind === "paragraph" && paragraph.text, "第\t一段。");
});

test("leading BOM is stripped and accounted as per-line syntax", () => {
  const body = ["---", "title: t", "---", "", "第一段。"].join("\n");
  const withBom = `\uFEFF${body}`;
  const parsed = parseMarkdown(withBom);
  assert.equal(parsed.sourceChars, withBom.length);
  // BOM 计入第 1 行（front matter 围栏行）语法消费：3 + 1。
  assert.equal(parsed.consumed[0]?.syntaxChars, 4);
  const rawLines = withBom.split("\n");
  const totals = { content: 0, syntax: 0 };
  for (const entry of parsed.consumed) {
    assert.equal(
      entry.contentChars + entry.syntaxChars,
      rawLines[entry.line - 1]?.length,
      `line ${entry.line} accounting mismatch`,
    );
    totals.content += entry.contentChars;
    totals.syntax += entry.syntaxChars;
  }
  assert.equal(
    totals.content + totals.syntax + parsed.newlineChars,
    parsed.sourceChars,
  );
  // BOM 不进入内容：与无 BOM 版解析结果一致。
  assert.deepEqual(parsed.blocks, parseMarkdown(body).blocks);
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
