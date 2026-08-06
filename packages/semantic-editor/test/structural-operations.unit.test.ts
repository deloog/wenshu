import assert from "node:assert/strict";
import test from "node:test";

import {
  RandomIdAllocator,
  fromProseMirrorDocument,
  toProseMirrorDocument,
  type IdAllocator,
  type IdPrefix,
} from "../src/index.ts";
import {
  deleteTableColumn,
  deleteTableRow,
  demoteSection,
  insertListItem,
  deleteListItem,
  insertTableColumn,
  insertTableRow,
  mergeLists,
  promoteParagraph,
  splitList,
} from "../src/structural-operations.ts";
import { moveBlock } from "../src/operations.ts";
import type { Block, SupportedDocument } from "@wenshu/document-model";

class SequenceAllocator implements IdAllocator {
  #next = 0;

  allocate(prefix: IdPrefix): string {
    this.#next += 1;
    return `${prefix}_${this.#next.toString(16).padStart(32, "0")}`;
  }
}

/** Deterministic 0.2.0 document: paragraphs + two lists + a 2x2 table + section. */
function fixture(): SupportedDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: "doc_00000000000000000000000000000001",
    revision: 0,
    title: "structural",
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

function allIds(document: SupportedDocument): string[] {
  const ids = [document.documentId];
  const visit = (block: Block): void => {
    ids.push(block.id);
    if (block.type === "section") block.children.forEach(visit);
    if (block.type === "list") block.items.forEach((item) => ids.push(item.id));
    if (block.type === "table") {
      block.columns.forEach((column) => ids.push(column.id));
      block.rows.forEach((row) => {
        ids.push(row.id);
        row.cells.forEach((cell) => ids.push(cell.id));
      });
    }
  };
  document.blocks.forEach(visit);
  return ids.sort();
}

function pm(document: SupportedDocument) {
  return toProseMirrorDocument(document);
}

function canonical(result: { document: unknown }): SupportedDocument {
  return fromProseMirrorDocument(
    result.document as Parameters<typeof fromProseMirrorDocument>[0],
  );
}

const TABLE = "node_00000000000000000000000000000014";
const LIST_A = "node_00000000000000000000000000000012";
const LIST_B = "node_00000000000000000000000000000013";
const ROW_2 = "row_00000000000000000000000000000042";
const COL_2 = "col_00000000000000000000000000000032";

test("insertTableRow: fresh row+cell IDs, column alignment, others preserved", () => {
  const before = fixture();
  const result = insertTableRow(pm(before), TABLE, new SequenceAllocator(), 1);
  const after = canonical(result);
  const table = after.blocks.find((b) => b.id === TABLE);
  assert.ok(table?.type === "table");
  assert.equal(table.rows.length, 3);
  const added = table.rows[1];
  assert.ok(added !== undefined);
  assert.deepEqual(
    added.cells.map((c) => c.columnId),
    table.columns.map((c) => c.id),
  );
  assert.ok(added.cells.every((c) => c.text === ""));
  const removed = new Set(result.removedNodeIds);
  assert.equal(removed.size, 0);
  const keptIds = allIds(before).filter((id) => !result.affectedNodeIds.includes(id));
  assert.deepEqual(
    allIds(after).filter((id) => keptIds.includes(id)),
    keptIds,
  );
});

test("insertTableRow: out-of-range index and missing table fail closed", () => {
  const doc = pm(fixture());
  assert.throws(
    () => insertTableRow(doc, TABLE, new SequenceAllocator(), 99),
    /PB02_OPERATION_INVALID/,
  );
  assert.throws(
    () =>
      insertTableRow(
        doc,
        "node_ffffffffffffffffffffffffffffffff",
        new RandomIdAllocator(),
      ),
    /PB02_OPERATION_TARGET_MISSING/,
  );
});

test("deleteTableRow: row+cells removed exactly, last row schema-guarded", () => {
  const before = fixture();
  const result = deleteTableRow(pm(before), ROW_2);
  const after = canonical(result);
  const table = after.blocks.find((b) => b.id === TABLE);
  assert.ok(table?.type === "table");
  assert.equal(table.rows.length, 1);
  assert.deepEqual(
    [...result.removedNodeIds].sort(),
    [
      ROW_2,
      "cell_00000000000000000000000000000053",
      "cell_00000000000000000000000000000054",
    ].sort(),
  );
  assert.deepEqual(
    allIds(after),
    allIds(before).filter((id) => !result.removedNodeIds.includes(id)),
  );
  assert.throws(
    () => deleteTableRow(result.document, "row_00000000000000000000000000000041"),
    /PB02_OPERATION_SCHEMA_GUARD/,
  );
});

test("insertTableColumn: new column + one cell per row, header bounds guarded", () => {
  const before = fixture();
  const result = insertTableColumn(
    pm(before),
    TABLE,
    "h3",
    "center",
    new SequenceAllocator(),
    1,
  );
  const after = canonical(result);
  const table = after.blocks.find((b) => b.id === TABLE);
  assert.ok(table?.type === "table");
  assert.equal(table.columns.length, 3);
  assert.equal(table.columns[1]?.header, "h3");
  for (const row of table.rows) {
    assert.equal(row.cells.length, 3);
    assert.equal(row.cells[1]?.columnId, table.columns[1]?.id);
  }
  assert.throws(
    () => insertTableColumn(pm(fixture()), TABLE, "", "start", new SequenceAllocator()),
    /PB02_OPERATION_SCHEMA_GUARD/,
  );
});

test("deleteTableColumn: column+its cells removed from every row, alignment kept", () => {
  const before = fixture();
  const result = deleteTableColumn(pm(before), COL_2);
  const after = canonical(result);
  const table = after.blocks.find((b) => b.id === TABLE);
  assert.ok(table?.type === "table");
  assert.equal(table.columns.length, 1);
  for (const row of table.rows) {
    assert.equal(row.cells.length, 1);
    assert.equal(row.cells[0]?.columnId, "col_00000000000000000000000000000031");
  }
  assert.deepEqual(
    [...result.removedNodeIds].sort(),
    [
      COL_2,
      "cell_00000000000000000000000000000052",
      "cell_00000000000000000000000000000054",
    ].sort(),
  );
  assert.deepEqual(
    allIds(after),
    allIds(before).filter((id) => !result.removedNodeIds.includes(id)),
  );
  assert.throws(
    () => deleteTableColumn(result.document, "col_00000000000000000000000000000031"),
    /PB02_OPERATION_SCHEMA_GUARD/,
  );
});

test("mergeLists: item IDs preserved, only the source list node removed", () => {
  const before = fixture();
  const result = mergeLists(pm(before), LIST_B, LIST_A);
  const after = canonical(result);
  const merged = after.blocks.find((b) => b.id === LIST_A);
  assert.ok(merged?.type === "list");
  assert.deepEqual(
    merged.items.map((i) => i.id),
    [
      "item_00000000000000000000000000000021",
      "item_00000000000000000000000000000022",
      "item_00000000000000000000000000000023",
    ],
  );
  assert.deepEqual(result.removedNodeIds, [LIST_B]);
  assert.deepEqual(
    allIds(after),
    allIds(before).filter((id) => id !== LIST_B),
  );
});

test("mergeLists: ordered mismatch / non-list / last-block source all fail closed", () => {
  const ordered = fixture();
  const listA = ordered.blocks[1];
  assert.ok(listA?.type === "list");
  listA.ordered = true;
  assert.throws(
    () => mergeLists(pm(ordered), LIST_B, LIST_A),
    /PB02_OPERATION_INVALID/,
  );
  assert.throws(
    () => mergeLists(pm(fixture()), "node_00000000000000000000000000000011", LIST_A),
    /PB02_OPERATION_INVALID/,
  );
  const lonely = fixture();
  lonely.blocks = [lonely.blocks[1] as Block, lonely.blocks[2] as Block].slice(0, 1);
  assert.throws(() => mergeLists(pm(lonely), LIST_A, LIST_A), /PB02_OPERATION/);
});

test("splitList: original keeps ID+leading items, tail keeps item IDs under fresh list", () => {
  const before = fixture();
  const merged = mergeLists(pm(before), LIST_B, LIST_A);
  const result = splitList(
    merged.document,
    LIST_A,
    "item_00000000000000000000000000000023",
    new SequenceAllocator(),
  );
  const after = canonical(result);
  const first = after.blocks.find((b) => b.id === LIST_A);
  assert.ok(first?.type === "list");
  assert.deepEqual(
    first.items.map((i) => i.id),
    ["item_00000000000000000000000000000021", "item_00000000000000000000000000000022"],
  );
  const blocks = after.blocks;
  const firstIndex = blocks.findIndex((b) => b.id === LIST_A);
  const tail = blocks[firstIndex + 1];
  assert.ok(tail?.type === "list");
  assert.notEqual(tail.id, LIST_A);
  assert.deepEqual(
    tail.items.map((i) => i.id),
    ["item_00000000000000000000000000000023"],
  );
  assert.deepEqual(result.removedNodeIds, []);
  assert.deepEqual(
    allIds(after).filter((id) => id !== tail.id),
    allIds(canonical(merged)),
  );
  assert.throws(
    () =>
      splitList(
        merged.document,
        LIST_A,
        "item_00000000000000000000000000000021",
        new SequenceAllocator(),
      ),
    /PB02_OPERATION_INVALID/,
  );
});

test("promoteParagraph: paragraph becomes first child with ID preserved (D1)", () => {
  const before = fixture();
  const target = "node_00000000000000000000000000000011";
  const result = promoteParagraph(pm(before), target, 1, new SequenceAllocator());
  const after = canonical(result);
  const section = after.blocks[0];
  assert.ok(section?.type === "section");
  assert.equal(section.title, "intro");
  assert.equal(section.level, 1);
  assert.deepEqual(
    section.children.map((c) => c.id),
    [target],
  );
  assert.deepEqual(result.removedNodeIds, []);
  assert.ok(allIds(after).includes(target));
  assert.throws(
    () => promoteParagraph(pm(fixture()), target, 7, new SequenceAllocator()),
    /PB02_OPERATION_INVALID/,
  );
  assert.throws(
    () => promoteParagraph(pm(fixture()), LIST_A, 1, new SequenceAllocator()),
    /PB02_OPERATION_INVALID/,
  );
  const long = fixture();
  const first = long.blocks[0];
  assert.ok(first?.type === "paragraph");
  first.text = "x".repeat(501);
  assert.throws(
    () => promoteParagraph(pm(long), target, 1, new SequenceAllocator()),
    /PB02_OPERATION_SCHEMA_GUARD/,
  );
});

test("demoteSection: title becomes fresh paragraph, children lifted with IDs kept", () => {
  const before = fixture();
  const sectionId = "node_00000000000000000000000000000015";
  const result = demoteSection(pm(before), sectionId, new SequenceAllocator());
  const after = canonical(result);
  const index = after.blocks.findIndex(
    (b) => b.id === "node_00000000000000000000000000000014",
  );
  const paragraph = after.blocks[index + 1];
  assert.ok(paragraph?.type === "paragraph");
  assert.equal(paragraph.text, "sec");
  const lifted = after.blocks[index + 2];
  assert.equal(lifted?.id, "node_00000000000000000000000000000016");
  assert.deepEqual(result.removedNodeIds, [sectionId]);
  assert.deepEqual(
    allIds(after).filter((id) => id !== paragraph.id),
    allIds(before).filter((id) => id !== sectionId),
  );
  assert.throws(
    () => demoteSection(pm(fixture()), LIST_A, new SequenceAllocator()),
    /PB02_OPERATION_INVALID/,
  );
});

test("insertListItem: caller-provided text at index, empty text schema-guarded", () => {
  const before = fixture();
  const result = insertListItem(
    pm(before),
    LIST_A,
    1,
    "inserted",
    new SequenceAllocator(),
  );
  const after = canonical(result);
  const list = after.blocks.find((b) => b.id === LIST_A);
  assert.ok(list?.type === "list");
  assert.deepEqual(
    list.items.map((i) => i.text),
    ["a", "inserted", "b"],
  );
  assert.deepEqual(list.items.map((i) => i.id).slice(0, 1), [
    "item_00000000000000000000000000000021",
  ]);
  assert.deepEqual(result.removedNodeIds, []);
  assert.throws(
    () => insertListItem(pm(fixture()), LIST_A, 1, "", new SequenceAllocator()),
    /PB02_OPERATION_SCHEMA_GUARD/,
  );
  assert.throws(
    () => insertListItem(pm(fixture()), LIST_A, 99, "x", new SequenceAllocator()),
    /PB02_OPERATION_INVALID/,
  );
});

test("deleteListItem: item removed with accounting, last item schema-guarded", () => {
  const before = fixture();
  const result = deleteListItem(pm(before), "item_00000000000000000000000000000021");
  const after = canonical(result);
  const list = after.blocks.find((b) => b.id === LIST_A);
  assert.ok(list?.type === "list");
  assert.deepEqual(
    list.items.map((i) => i.id),
    ["item_00000000000000000000000000000022"],
  );
  assert.deepEqual(result.removedNodeIds, ["item_00000000000000000000000000000021"]);
  assert.deepEqual(
    allIds(after),
    allIds(before).filter((id) => id !== "item_00000000000000000000000000000021"),
  );
  assert.throws(
    () => deleteListItem(pm(fixture()), "item_00000000000000000000000000000023"),
    /PB02_OPERATION_SCHEMA_GUARD/,
  );
});

test("moveBlock with destinationIndex: same-parent reorder, bounds guarded", () => {
  const before = fixture();
  const down = moveBlock(pm(before), LIST_A, before.documentId, 2);
  const afterDown = canonical(down);
  assert.deepEqual(afterDown.blocks.map((b) => b.id).slice(0, 3), [
    "node_00000000000000000000000000000011",
    LIST_B,
    LIST_A,
  ]);
  const up = moveBlock(down.document, LIST_A, before.documentId, 1);
  const afterUp = canonical(up);
  assert.deepEqual(afterUp.blocks.map((b) => b.id).slice(0, 3), [
    "node_00000000000000000000000000000011",
    LIST_A,
    LIST_B,
  ]);
  assert.deepEqual(down.removedNodeIds, []);
  assert.throws(
    () => moveBlock(pm(fixture()), LIST_A, before.documentId, 99),
    /PB02_OPERATION_INVALID/,
  );
  const legacy = moveBlock(pm(fixture()), LIST_A, before.documentId);
  assert.equal(canonical(legacy).blocks.at(-1)?.id, LIST_A);
});
