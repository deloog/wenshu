import assert from "node:assert/strict";
import test from "node:test";

import type { SupportedDocument } from "@wenshu/document-model";
import { RandomIdAllocator, toProseMirrorDocument } from "@wenshu/semantic-editor";
import * as semanticEditor from "@wenshu/semantic-editor";

import { TransactionManager } from "../src/index.ts";

function document(): SupportedDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: "doc_00000000000000000000000000000001",
    revision: 0,
    title: "transaction test",
    language: "zh-CN",
    assets: [],
    blocks: [
      { id: "node_00000000000000000000000000000011", type: "paragraph", text: "one" },
      { id: "node_00000000000000000000000000000012", type: "paragraph", text: "two" },
      {
        id: "node_00000000000000000000000000000013",
        type: "section",
        level: 1,
        title: "section",
        children: [
          {
            id: "node_00000000000000000000000000000014",
            type: "paragraph",
            text: "three",
          },
        ],
      },
    ],
  };
}

function canonical(manager: TransactionManager): SupportedDocument {
  const dynamicImport = semanticEditor.fromProseMirrorDocument;
  return dynamicImport(manager.snapshot());
}

function newManager(): TransactionManager {
  return new TransactionManager(
    toProseMirrorDocument(document()),
    new RandomIdAllocator(),
  );
}

test("human and AI commit through one transaction boundary", async () => {
  const manager = newManager();
  const human = await manager.execute("human", (session) => {
    session.apply({
      kind: "rewrite",
      id: "node_00000000000000000000000000000011",
      replacement: {
        id: "node_00000000000000000000000000000011",
        type: "paragraph",
        text: "human",
      },
    });
  });
  const ai = await manager.execute("ai", (session) => {
    session.apply({
      kind: "rewrite",
      id: "node_00000000000000000000000000000012",
      replacement: {
        id: "node_00000000000000000000000000000012",
        type: "paragraph",
        text: "ai",
      },
    });
  });
  assert.equal(human.status, "committed");
  assert.equal(ai.status, "committed");
  assert.equal(canonical(manager).blocks[0]?.type, "paragraph");
});

test("a failure after a staged operation rolls back atomically", () => {
  const manager = newManager();
  const before = canonical(manager);
  const session = manager.begin("ai");
  session.apply({
    kind: "insert",
    parentId: before.documentId,
    block: {
      id: "node_ffffffffffffffffffffffffffffffff",
      type: "paragraph",
      text: "staged",
    },
  });
  assert.throws(
    () =>
      session.apply({
        kind: "rewrite",
        id: "node_00000000000000000000000000000011",
        replacement: {
          id: "node_ffffffffffffffffffffffffffffffff",
          type: "paragraph",
          text: "bad",
        },
      }),
    /PB02_OPERATION_ID_GUARD/u,
  );
  const outcome = manager.rollback(session);
  assert.equal(outcome.status, "rolled_back");
  assert.equal(outcome.status === "rolled_back" && outcome.reason, "operation_failed");
  assert.deepEqual(canonical(manager), before);
});

test("undo then redo returns deep-equal committed document and stable IDs", () => {
  const manager = newManager();
  const before = canonical(manager);
  const session = manager.begin("human");
  session.apply({
    kind: "move",
    id: "node_00000000000000000000000000000011",
    destinationParentId: "node_00000000000000000000000000000013",
  });
  const committed = manager.commit(session);
  assert.equal(committed.status, "committed");
  const after = canonical(manager);
  manager.undo();
  assert.deepEqual(canonical(manager), before);
  manager.redo();
  assert.deepEqual(canonical(manager), after);
});

test("cancelled in-flight async transaction has no side effect and is idempotent", async () => {
  const manager = newManager();
  const before = canonical(manager);
  const abort = new AbortController();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const outcomePromise = manager.execute(
    "ai",
    async (session) => {
      session.apply({
        kind: "insert",
        parentId: before.documentId,
        block: {
          id: "node_ffffffffffffffffffffffffffffffff",
          type: "paragraph",
          text: "staged",
        },
      });
      await gate;
    },
    abort.signal,
  );
  abort.abort();
  if (release === undefined) throw new Error("test gate missing");
  release();
  const outcome = await outcomePromise;
  assert.equal(outcome.status, "rolled_back");
  assert.equal(outcome.status === "rolled_back" && outcome.reason, "cancelled");
  assert.deepEqual(canonical(manager), before);
  const session = manager.begin("human");
  const first = manager.cancel(session);
  const second = manager.cancel(session);
  assert.deepEqual(second, first);
});

test("seeded transactions are either fully committed or leave the document unchanged", () => {
  const manager = newManager();
  let seed = 0xfeed1234;
  const random = (): number => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed;
  };
  for (let index = 0; index < 80; index += 1) {
    const before = canonical(manager);
    const session = manager.begin(index % 2 === 0 ? "human" : "ai");
    if (random() % 4 === 0) {
      assert.throws(() =>
        session.apply({
          kind: "rewrite",
          id: "node_00000000000000000000000000000011",
          replacement: {
            id: "node_ffffffffffffffffffffffffffffffff",
            type: "paragraph",
            text: "bad",
          },
        }),
      );
      manager.rollback(session);
      assert.deepEqual(canonical(manager), before);
    } else {
      session.apply({
        kind: "insert",
        parentId: before.documentId,
        block: {
          id: "node_ffffffffffffffffffffffffffffffff",
          type: "paragraph",
          text: "new",
        },
      });
      const outcome = manager.commit(session);
      assert.equal(outcome.status, "committed");
    }
  }
});

test("random committed history undoes to its origin and redoes byte-for-byte", () => {
  const manager = newManager();
  const origin = canonical(manager);
  const snapshots: SupportedDocument[] = [];
  for (let index = 0; index < 32; index += 1) {
    const session = manager.begin(index % 2 === 0 ? "human" : "ai");
    session.apply({
      kind: "insert",
      parentId: origin.documentId,
      block: {
        id: "node_ffffffffffffffffffffffffffffffff",
        type: "paragraph",
        text: "new",
      },
    });
    assert.equal(manager.commit(session).status, "committed");
    snapshots.push(canonical(manager));
  }
  for (let index = snapshots.length - 1; index >= 0; index -= 1) manager.undo();
  assert.deepEqual(canonical(manager), origin);
  for (const expected of snapshots) {
    manager.redo();
    assert.deepEqual(canonical(manager), expected);
  }
  const atLimit = canonical(manager);
  manager.redo();
  assert.deepEqual(canonical(manager), atLimit);
});

test("raw PB-02 operations are absent from the public package surface", () => {
  assert.equal("insertBlock" in semanticEditor, false);
  assert.equal("deleteBlock" in semanticEditor, false);
  assert.equal("moveBlock" in semanticEditor, false);
});

test("only the manager can make a staged document visible", () => {
  const manager = newManager();
  const session = manager.begin("human");
  assert.throws(
    () => session.commit(Symbol("not-manager")),
    /PB03_TRANSACTION_MANAGER_REQUIRED/u,
  );
  assert.equal(manager.cancel(session).status, "rolled_back");
});
