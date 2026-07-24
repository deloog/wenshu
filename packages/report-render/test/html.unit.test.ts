import assert from "node:assert/strict";
import test from "node:test";

import type { WenshuDocument } from "@wenshu/document-model";

import { documentTextSequence, renderDocumentHtml } from "../src/index.ts";

const DOCUMENT: WenshuDocument = {
  schemaVersion: "0.1.0",
  documentId: "doc_test",
  revision: 0,
  title: '测试 <标题> & "引号"',
  language: "zh-CN",
  blocks: [
    {
      id: "node_s1",
      type: "section",
      level: 1,
      title: "第一章",
      children: [
        {
          id: "node_p1",
          type: "paragraph",
          text: "段落 <script>alert(1)</script> 文本",
        },
        { id: "node_q1", type: "quote", text: "引用内容", attribution: "出处 A" },
        {
          id: "node_l1",
          type: "list",
          ordered: false,
          items: [
            { id: "item_1", text: "条目一" },
            { id: "item_2", text: "条目二" },
          ],
        },
        {
          id: "node_t1",
          type: "table",
          columns: [
            { id: "col_1", header: "列A", align: "start" },
            { id: "col_2", header: "列B", align: "end" },
          ],
          rows: [
            {
              id: "row_1",
              cells: [
                { id: "cell_1", columnId: "col_1", text: "a" },
                { id: "cell_2", columnId: "col_2", text: "1" },
              ],
            },
          ],
        },
        { id: "node_f1", type: "figure", assetId: "asset_1", altText: "图 说明" },
        { id: "node_b1", type: "pageBreak", reason: "source" },
        {
          id: "node_s2",
          type: "section",
          level: 2,
          title: "小节",
          children: [{ id: "node_p2", type: "paragraph", text: "嵌套段落" }],
        },
      ],
    },
  ],
  assets: [
    {
      id: "asset_1",
      kind: "image",
      path: "assets/abc.svg",
      mediaType: "image/svg+xml",
      sha256: "0".repeat(64),
    },
  ],
};

test("all document text is entity-escaped, no raw HTML injection", () => {
  const html = renderDocumentHtml(DOCUMENT);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
  assert.equal(html.includes("测试 &lt;标题&gt; &amp; &quot;引号&quot;"), true);
});

test("semantic structure: heading levels, labelled sections, table scope, figure", () => {
  const html = renderDocumentHtml(DOCUMENT);
  assert.equal(html.includes("<header><h1>"), true);
  assert.equal(
    html.includes('<h2 id="node_s1">第一章</h2>') &&
      html.includes('<section aria-labelledby="node_s1">'),
    true,
  );
  assert.equal(html.includes('<h3 id="node_s2">小节</h3>'), true);
  assert.equal(html.includes('<th scope="col" data-align="start">列A</th>'), true);
  assert.equal(html.includes('<td data-align="end">1</td>'), true);
  assert.equal(
    html.includes(
      '<figure><img src="assets/abc.svg" alt="图 说明"><figcaption>图 说明</figcaption></figure>',
    ),
    true,
  );
  assert.equal(
    html.includes(
      "<blockquote><p>引用内容</p><footer><cite>出处 A</cite></footer></blockquote>",
    ),
    true,
  );
  assert.equal(html.includes('<div class="page-break" role="separator"'), true);
});

test("document text sequence matches the rendered reading order", () => {
  assert.deepEqual(documentTextSequence(DOCUMENT), [
    '测试 <标题> & "引号"',
    "第一章",
    "段落 <script>alert(1)</script> 文本",
    "引用内容",
    "出处 A",
    "条目一",
    "条目二",
    "列A",
    "列B",
    "a",
    "1",
    "图 说明",
    "小节",
    "嵌套段落",
  ]);
});
