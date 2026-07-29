import assert from "node:assert/strict";
import test from "node:test";

import type { SupportedDocument } from "@wenshu/document-model";
import { TransactionManager } from "@wenshu/editor-transactions";
import {
  RandomIdAllocator,
  fromProseMirrorDocument,
  toProseMirrorDocument,
} from "@wenshu/semantic-editor";
import { FROZEN_TOOL_NAMES } from "@wenshu/semantic-tools";

import { DiffReview } from "../src/index.ts";

const documentId = "doc_00000000000000000000000000000001";
const first = "node_00000000000000000000000000000011";
const second = "node_00000000000000000000000000000012";

function source(): SupportedDocument {
  return {
    schemaVersion: "0.2.0",
    documentId,
    revision: 0,
    title: "review test",
    language: "zh-CN",
    assets: [],
    blocks: [
      { id: first, type: "paragraph", text: "first" },
      { id: second, type: "paragraph", text: "second" },
    ],
  };
}

function setup(): {
  readonly manager: TransactionManager;
  readonly review: DiffReview;
} {
  const manager = new TransactionManager(
    toProseMirrorDocument(source()),
    new RandomIdAllocator(),
  );
  const review = new DiffReview(manager, {
    allowedTools: FROZEN_TOOL_NAMES,
    writableNodeIds: [documentId, first, second],
  });
  return { manager, review };
}

function snapshot(manager: TransactionManager): SupportedDocument {
  return fromProseMirrorDocument(manager.snapshot());
}

test("rejecting an AI diff never changes the authoritative source", async () => {
  const { manager, review } = setup();
  const before = snapshot(manager);
  const [proposal] = await review.propose([
    { tool: "rewrite", args: { nodeId: first, text: "AI suggestion" } },
  ]);
  assert.equal(proposal?.status, "pending");
  assert.equal(proposal?.diffs[0]?.anchor.nodeId, first);
  assert.deepEqual(snapshot(manager), before);
  assert.equal(
    proposal === undefined ? "bad" : review.reject(proposal.id).status,
    "rejected",
  );
  assert.deepEqual(snapshot(manager), before);
});

test("a published proposal cannot be mutated into a different write", async () => {
  const { manager, review } = setup();
  const [proposal] = await review.propose([
    { tool: "rewrite", args: { nodeId: first, text: "frozen candidate" } },
  ]);
  assert.ok(proposal !== undefined);
  if (proposal === undefined) return;
  const request = proposal.request as { readonly args: { readonly text: string } };
  assert.throws(() => {
    (request.args as { text: string }).text = "different write";
  });
  assert.equal((await review.accept(proposal.id)).status, "accepted");
  const after = snapshot(manager);
  assert.equal(
    after.blocks[0]?.type === "paragraph" && after.blocks[0].text,
    "frozen candidate",
  );
});

test("partial acceptance commits only the accepted proposal and PB-03 undo reverts it", async () => {
  const { manager, review } = setup();
  const before = snapshot(manager);
  const proposals = await review.propose([
    { tool: "rewrite", args: { nodeId: first, text: "accept me" } },
    { tool: "rewrite", args: { nodeId: second, text: "leave pending" } },
  ]);
  const accepted = proposals[0];
  const pending = proposals[1];
  assert.ok(accepted !== undefined && pending !== undefined);
  if (accepted === undefined || pending === undefined) return;
  assert.equal((await review.accept(accepted.id)).status, "accepted");
  const afterAccept = snapshot(manager);
  assert.equal(
    afterAccept.blocks[0]?.type === "paragraph" && afterAccept.blocks[0].text,
    "accept me",
  );
  assert.equal(
    afterAccept.blocks[1]?.type === "paragraph" && afterAccept.blocks[1].text,
    "second",
  );
  assert.equal(
    review.list().find((proposal) => proposal.id === pending.id)?.status,
    "pending",
  );
  assert.equal(review.reject(pending.id).status, "rejected");
  assert.equal(review.undoAccepted().status, "reverted");
  assert.deepEqual(snapshot(manager), before);
});
