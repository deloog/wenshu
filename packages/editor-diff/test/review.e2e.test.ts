import assert from "node:assert/strict";
import test from "node:test";

import { TransactionManager } from "@wenshu/editor-transactions";
import {
  RandomIdAllocator,
  fromProseMirrorDocument,
  toProseMirrorDocument,
} from "@wenshu/semantic-editor";
import { FROZEN_TOOL_NAMES } from "@wenshu/semantic-tools";

import { DiffReview } from "../src/index.ts";

test("model proposal to reject path has no write side effect", async () => {
  const nodeId = "node_00000000000000000000000000000011";
  const source = {
    schemaVersion: "0.2.0" as const,
    documentId: "doc_00000000000000000000000000000001",
    revision: 0,
    title: "e2e",
    language: "zh-CN" as const,
    assets: [],
    blocks: [
      {
        id: nodeId,
        type: "paragraph" as const,
        text: "before",
      },
    ],
  };
  const manager = new TransactionManager(
    toProseMirrorDocument(source),
    new RandomIdAllocator(),
  );
  const review = new DiffReview(manager, {
    allowedTools: FROZEN_TOOL_NAMES,
    writableNodeIds: [source.documentId, nodeId],
  });
  const before = fromProseMirrorDocument(manager.snapshot());
  const [proposal] = await review.propose([
    { tool: "rewrite", args: { nodeId, text: "candidate" } },
  ]);
  assert.ok(proposal !== undefined);
  if (proposal === undefined) return;
  review.reject(proposal.id);
  assert.deepEqual(fromProseMirrorDocument(manager.snapshot()), before);
});
