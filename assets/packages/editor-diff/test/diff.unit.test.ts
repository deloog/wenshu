import assert from "node:assert/strict";
import test from "node:test";

import type { SupportedDocument } from "@wenshu/document-model";

import { diffDocuments } from "../src/index.ts";

const first = "node_00000000000000000000000000000011";
const second = "node_00000000000000000000000000000012";
const section = "node_00000000000000000000000000000013";

function document(text: string, parent = false): SupportedDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: "doc_00000000000000000000000000000001",
    revision: 0,
    title: "diff test",
    language: "zh-CN",
    assets: [],
    blocks: parent
      ? [
          {
            id: section,
            type: "section",
            level: 1,
            title: "s",
            children: [
              { id: first, type: "paragraph", text },
              { id: second, type: "paragraph", text: "two" },
            ],
          },
        ]
      : [
          { id: first, type: "paragraph", text },
          { id: second, type: "paragraph", text: "two" },
          { id: section, type: "section", level: 1, title: "s", children: [] },
        ],
  };
}

test("field diff anchors a rewrite to its stable node and preserves context", () => {
  const diff = diffDocuments(document("before"), document("after"), "proposal_1");
  assert.deepEqual(diff, [
    {
      id: `proposal_1:${first}:text`,
      kind: "changed",
      anchor: {
        nodeId: first,
        parentId: "doc_00000000000000000000000000000001",
        ancestorIds: ["doc_00000000000000000000000000000001"],
        siblingIndex: 0,
      },
      field: "text",
      before: "before",
      after: "after",
    },
  ]);
});

test("move is represented as a parent anchor change, never an opaque whole-block replacement", () => {
  const diff = diffDocuments(document("one"), document("one", true), "proposal_2");
  const parent = diff.find((entry) => entry.id === `proposal_2:${first}:$parent`);
  assert.deepEqual(parent?.before, "doc_00000000000000000000000000000001");
  assert.equal(parent?.after, section);
  assert.ok(diff.every((entry) => entry.field !== "$block"));
});
