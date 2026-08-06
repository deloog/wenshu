import assert from "node:assert/strict";
import test from "node:test";

import type { SupportedDocument } from "@wenshu/document-model";
import {
  toProseMirrorDocument,
  fromProseMirrorDocument,
  type IdAllocator,
  type IdPrefix,
} from "@wenshu/semantic-editor";
import { computeExpectedRemovals, type EditorCommand } from "../src/commands.ts";
import { TransactionManager } from "../src/index.ts";

class SequenceAllocator implements IdAllocator {
  #next = 0;

  allocate(prefix: IdPrefix): string {
    this.#next += 1;
    return `${prefix}_${this.#next.toString(16).padStart(32, "0")}`;
  }
}

function fixture(): SupportedDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: "doc_00000000000000000000000000000001",
    revision: 0,
    title: "structural-commands",
    language: "zh-CN",
    assets: [],
    blocks: [
      { id: "node_00000000000000000000000000000011", type: "paragraph", text: "intro" },
      {
        id: "node_00000000000000000000000000000012",
        type: "list",
        ordered: false,
        items: [
          { id: "item_00000000000000000000000000000021", text: "a" },
          { id: "item_00000000000000000000000000000022", text: "b" },
        ],
      },
      {
        id: "node_00000000000000000000000000000013",
        type: "list",
        ordered: false,
        items: [{ id: "item_00000000000000000000000000000023", text: "c" }],
      },
      {
        id: "node_00000000000000000000000000000014",
        type: "table",
        columns: [
          { id: "col_00000000000000000000000000000031", header: "h1", align: "start" },
          { id: "col_00000000000000000000000000000032", header: "h2", align: "end" },
        ],
        rows: [
          {
            id: "row_00000000000000000000000000000041",
            cells: [
              {
                id: "cell_00000000000000000000000000000051",
                columnId: "col_00000000000000000000000000000031",
                text: "r1c1",
              },
              {
                id: "cell_00000000000000000000000000000052",
                columnId: "col_00000000000000000000000000000032",
                text: "r1c2",
              },
            ],
          },
          {
            id: "row_00000000000000000000000000000042",
            cells: [
              {
                id: "cell_00000000000000000000000000000053",
                columnId: "col_00000000000000000000000000000031",
                text: "r2c1",
              },
              {
                id: "cell_00000000000000000000000000000054",
                columnId: "col_00000000000000000000000000000032",
                text: "r2c2",
              },
            ],
          },
        ],
      },
      {
        id: "node_00000000000000000000000000000015",
        type: "section",
        level: 2,
        title: "sec",
        children: [
          {
            id: "node_00000000000000000000000000000016",
            type: "paragraph",
            text: "body",
          },
        ],
      },
    ],
  };
}

const TABLE = "node_00000000000000000000000000000014";
const LIST_A = "node_00000000000000000000000000000012";
const LIST_B = "node_00000000000000000000000000000013";
const SECTION = "node_00000000000000000000000000000015";

function manager(): TransactionManager {
  return new TransactionManager(
    toProseMirrorDocument(fixture()),
    new SequenceAllocator(),
  );
}

function canonical(document: unknown): SupportedDocument {
  return fromProseMirrorDocument(
    document as Parameters<typeof fromProseMirrorDocument>[0],
  );
}

test("merge-lists command commits: removal accounting passes the stable-ID guard", async () => {
  const m = manager();
  const outcome = await m.execute("human", (session) => {
    session.apply({ kind: "merge-lists", sourceId: LIST_B, destinationId: LIST_A });
  });
  assert.equal(outcome.status, "committed");
  const doc = canonical(outcome.document);
  const merged = doc.blocks.find((b) => b.id === LIST_A);
  assert.ok(merged?.type === "list");
  assert.equal(merged.items.length, 3);
  assert.equal(
    doc.blocks.some((b) => b.id === LIST_B),
    false,
  );
});

test("split-list / promote-paragraph / demote-section commands commit", async () => {
  const m = manager();
  const split = await m.execute("human", (session) => {
    session.apply({
      kind: "split-list",
      listId: LIST_A,
      beforeItemId: "item_00000000000000000000000000000022",
    });
  });
  assert.equal(split.status, "committed");
  const promoted = await m.execute("human", (session) => {
    session.apply({
      kind: "promote-paragraph",
      paragraphId: "node_00000000000000000000000000000011",
      level: 1,
    });
  });
  assert.equal(promoted.status, "committed");
  const demoted = await m.execute("human", (session) => {
    session.apply({ kind: "demote-section", sectionId: SECTION });
  });
  assert.equal(demoted.status, "committed");
  const doc = canonical(demoted.document);
  assert.equal(
    doc.blocks.some((b) => b.id === SECTION),
    false,
  );
  assert.ok(doc.blocks.some((b) => b.type === "paragraph" && b.text === "sec"));
});

test("table row/column commands commit with exact removal accounting", async () => {
  const m = manager();
  const addRow = await m.execute("human", (session) => {
    session.apply({ kind: "insert-table-row", tableId: TABLE });
  });
  assert.equal(addRow.status, "committed");
  const addCol = await m.execute("human", (session) => {
    session.apply({
      kind: "insert-table-column",
      tableId: TABLE,
      header: "h3",
      align: "center",
    });
  });
  assert.equal(addCol.status, "committed");
  const delRow = await m.execute("human", (session) => {
    session.apply({
      kind: "delete-table-row",
      rowId: "row_00000000000000000000000000000042",
    });
  });
  assert.equal(delRow.status, "committed");
  const delCol = await m.execute("human", (session) => {
    session.apply({
      kind: "delete-table-column",
      columnId: "col_00000000000000000000000000000032",
    });
  });
  assert.equal(delCol.status, "committed");
  const doc = canonical(delCol.document);
  const table = doc.blocks.find((b) => b.id === TABLE);
  assert.ok(table?.type === "table");
  assert.equal(table.columns.length, 2);
  assert.equal(table.rows.length, 2);
});

test("failing structural command rolls back and leaves the document untouched", async () => {
  const m = manager();
  const before = canonical(m.snapshot());
  const outcome = await m.execute("human", (session) => {
    session.apply({
      kind: "delete-table-row",
      rowId: "row_ffffffffffffffffffffffffffffffff",
    });
  });
  assert.equal(outcome.status, "rolled_back");
  if (outcome.status === "rolled_back") {
    assert.equal(outcome.reason, "operation_failed");
  }
  assert.deepEqual(canonical(m.snapshot()), before);
});

test("undo/redo across structural commands is deep-equal with identical ID sets", async () => {
  const m = manager();
  const original = canonical(m.snapshot());
  await m.execute("human", (session) => {
    session.apply({ kind: "merge-lists", sourceId: LIST_B, destinationId: LIST_A });
  });
  await m.execute("human", (session) => {
    session.apply({ kind: "insert-table-row", tableId: TABLE });
  });
  const edited = canonical(m.snapshot());
  m.undo();
  m.undo();
  assert.deepEqual(canonical(m.snapshot()), original);
  m.redo();
  m.redo();
  assert.deepEqual(canonical(m.snapshot()), edited);
});

test("new command kinds stay inside the /internal boundary (no raw export leak)", async () => {
  const semanticEditor = await import("@wenshu/semantic-editor");
  assert.equal("insertTableRow" in semanticEditor, false);
  assert.equal("mergeLists" in semanticEditor, false);
  assert.equal("promoteParagraph" in semanticEditor, false);
  assert.equal("demoteSection" in semanticEditor, false);
});

/* ---------------------------------------------------------- MAJOR-2 tests */

const ROW_2 = "row_00000000000000000000000000000042";
const COL_2 = "col_00000000000000000000000000000032";

test("computeExpectedRemovals pins the allowed-removal set per kind (session-side)", () => {
  const doc = fixture();
  const cases: readonly [EditorCommand, readonly string[]][] = [
    [
      { kind: "delete", id: SECTION },
      [SECTION, "node_00000000000000000000000000000016"],
    ],
    [
      { kind: "delete-table-row", rowId: ROW_2 },
      [
        ROW_2,
        "cell_00000000000000000000000000000053",
        "cell_00000000000000000000000000000054",
      ],
    ],
    [
      { kind: "delete-table-column", columnId: COL_2 },
      [
        COL_2,
        "cell_00000000000000000000000000000052",
        "cell_00000000000000000000000000000054",
      ],
    ],
    [
      { kind: "delete-list-item", itemId: "item_00000000000000000000000000000021" },
      ["item_00000000000000000000000000000021"],
    ],
    [{ kind: "demote-section", sectionId: SECTION }, [SECTION]],
    [{ kind: "merge-lists", sourceId: LIST_B, destinationId: LIST_A }, [LIST_B]],
    [
      {
        kind: "split-list",
        listId: LIST_A,
        beforeItemId: "item_00000000000000000000000000000022",
      },
      [],
    ],
    [
      {
        kind: "promote-paragraph",
        paragraphId: "node_00000000000000000000000000000011",
        level: 1,
      },
      [],
    ],
    [{ kind: "insert-table-row", tableId: TABLE }, []],
    [{ kind: "insert-table-column", tableId: TABLE, header: "h", align: "start" }, []],
    [{ kind: "insert-list-item", listId: LIST_A, itemIndex: 1, text: "x" }, []],
    [{ kind: "move", id: LIST_A, destinationParentId: doc.documentId }, []],
    [
      {
        kind: "rewrite",
        id: "node_00000000000000000000000000000011",
        replacement: {
          id: "node_00000000000000000000000000000011",
          type: "paragraph",
          text: "y",
        },
      },
      [],
    ],
    // Unknown targets: no allowance; the raw operation fails closed instead.
    [{ kind: "delete", id: "node_ffffffffffffffffffffffffffffffff" }, []],
    [{ kind: "delete-table-row", rowId: "row_ffffffffffffffffffffffffffffffff" }, []],
    [
      { kind: "delete-table-column", columnId: "col_ffffffffffffffffffffffffffffffff" },
      [],
    ],
  ];
  for (const [command, expected] of cases) {
    assert.deepEqual(
      [...computeExpectedRemovals(command, doc)].sort(),
      [...expected].sort(),
      `${command.kind} allowance`,
    );
  }
});

/** 3+2 item lists: the multi-item branch the audit found zero-covered. */
function longListFixture(): SupportedDocument {
  const doc = fixture();
  const listA = doc.blocks[1];
  const listB = doc.blocks[2];
  if (listA?.type !== "list" || listB?.type !== "list") {
    throw new Error("test fixture invalid");
  }
  listA.items.push({ id: "item_00000000000000000000000000000024", text: "a3" });
  listB.items.push({ id: "item_00000000000000000000000000000025", text: "c2" });
  return doc;
}

test("merge-lists over 3+2 item lists commits; only the source list identity is removed", async () => {
  const m = new TransactionManager(
    toProseMirrorDocument(longListFixture()),
    new SequenceAllocator(),
  );
  const outcome = await m.execute("human", (session) => {
    session.apply({ kind: "merge-lists", sourceId: LIST_B, destinationId: LIST_A });
  });
  assert.equal(outcome.status, "committed");
  const doc = canonical(outcome.document);
  const merged = doc.blocks.find((block) => block.id === LIST_A);
  assert.ok(merged?.type === "list");
  assert.equal(merged.items.length, 5);
  assert.deepEqual(
    merged.items.map((entry) => entry.text),
    ["a", "b", "a3", "c", "c2"],
    "every item preserved in order",
  );
  assert.equal(
    doc.blocks.some((block) => block.id === LIST_B),
    false,
  );
});

test("delete-list-item from a 3-item list commits leaving exactly the other two items", async () => {
  const m = new TransactionManager(
    toProseMirrorDocument(longListFixture()),
    new SequenceAllocator(),
  );
  const outcome = await m.execute("human", (session) => {
    session.apply({
      kind: "delete-list-item",
      itemId: "item_00000000000000000000000000000022",
    });
  });
  assert.equal(outcome.status, "committed");
  const doc = canonical(outcome.document);
  const list = doc.blocks.find((block) => block.id === LIST_A);
  assert.ok(list?.type === "list");
  assert.deepEqual(
    list.items.map((entry) => entry.id),
    ["item_00000000000000000000000000000021", "item_00000000000000000000000000000024"],
  );
});
