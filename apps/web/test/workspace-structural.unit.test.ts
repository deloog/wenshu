import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Block, WenshuDocument } from "@wenshu/document-model";

import { WorkspaceController } from "../src/workspace/controller.ts";

const hex = (seed: string): string => seed.padEnd(32, "0").slice(0, 32);
const node = (seed: string): string => `node_${hex(seed)}`;
const item = (seed: string): string => `item_${hex(seed)}`;
const col = (seed: string): string => `col_${hex(seed)}`;
const row = (seed: string): string => `row_${hex(seed)}`;
const cell = (seed: string): string => `cell_${hex(seed)}`;

function listBlock(id: string, items: readonly [string, string][]): Block {
  return {
    id,
    type: "list",
    ordered: false,
    items: items.map(([itemId, text]) => ({ id: itemId, text })),
  };
}

function tableBlock(id: string, columnCount: number, rowCount: number): Block {
  const columns = Array.from({ length: columnCount }, (_, index) => ({
    id: col(`c${id.slice(5, 8)}${index}`),
    header: `表头${index + 1}`,
    align: "start" as const,
  }));
  return {
    id,
    type: "table",
    columns,
    rows: Array.from({ length: rowCount }, (_, rowIndex) => ({
      id: row(`b${id.slice(5, 8)}${rowIndex}`),
      cells: columns.map((column, columnIndex) => ({
        id: cell(`e${id.slice(5, 8)}${rowIndex}${columnIndex}`),
        columnId: column.id,
        text: `格${rowIndex + 1}${columnIndex + 1}`,
      })),
    })),
  };
}

function doc(blocks: readonly Block[]): WenshuDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: `doc_${hex("d002")}`,
    revision: 1,
    title: "结构测试",
    language: "zh-CN",
    assets: [],
    blocks: [...blocks],
  };
}

function collectIds(blocks: readonly Block[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    ids.push(block.id);
    if (block.type === "section") ids.push(...collectIds(block.children));
    if (block.type === "list") block.items.forEach((entry) => ids.push(entry.id));
    if (block.type === "table") {
      block.columns.forEach((column) => ids.push(column.id));
      block.rows.forEach((tableRow) => {
        ids.push(tableRow.id);
        tableRow.cells.forEach((tableCell) => ids.push(tableCell.id));
      });
    }
  }
  return ids;
}

function press(
  controller: WorkspaceController,
  key: string,
  mods?: { ctrl?: boolean; shift?: boolean },
): Promise<boolean> {
  return controller.handleKey({
    key,
    ctrlKey: mods?.ctrl ?? false,
    shiftKey: mods?.shift ?? false,
  });
}

async function focusOn(controller: WorkspaceController, id: string): Promise<number> {
  const rows = controller.snapshot().rows;
  const target = rows.findIndex((entry) =>
    entry.kind === "item" ? entry.itemId === id : entry.blockId === id,
  );
  assert.notEqual(target, -1, `row for ${id} exists`);
  const delta = target - controller.snapshot().focus.rowIndex;
  for (let index = 0; index < Math.abs(delta); index += 1) {
    await press(controller, delta > 0 ? "ArrowDown" : "ArrowUp");
  }
  assert.equal(controller.snapshot().focus.rowIndex, target);
  return target;
}

describe("A-03 workspace: list structure corrections", () => {
  const twoLists = (): WenshuDocument =>
    doc([
      listBlock(node("1101"), [
        [item("a101"), "甲"],
        [item("a102"), "乙"],
      ]),
      listBlock(node("1102"), [
        [item("b201"), "丙"],
        [item("b202"), "丁"],
      ]),
    ]);

  it("Ctrl+M merges with the next sibling list, item ids preserved, source list removed", async () => {
    const controller = new WorkspaceController(twoLists());
    await focusOn(controller, item("a102"));
    await press(controller, "m", { ctrl: true });
    const blocks = controller.snapshot().document.blocks;
    assert.equal(blocks.length, 1);
    const merged = blocks[0];
    assert.equal(merged?.type, "list");
    if (merged?.type !== "list") return;
    assert.equal(merged.id, node("1101"), "destination list keeps its id");
    assert.deepEqual(
      merged.items.map((entry) => entry.id),
      [item("a101"), item("a102"), item("b201"), item("b202")],
      "every item id preserved across the merge",
    );
  });

  it("Ctrl+M on the last list reports honestly and changes nothing", async () => {
    const controller = new WorkspaceController(twoLists());
    await focusOn(controller, item("b201"));
    const before = controller.snapshot().document;
    await press(controller, "m", { ctrl: true });
    assert.match(controller.snapshot().status, /下一兄弟不是列表/);
    assert.deepEqual(controller.snapshot().document, before);
  });

  it("Ctrl+Enter splits the list before the focused item, item ids preserved", async () => {
    const controller = new WorkspaceController(twoLists());
    await focusOn(controller, item("a102"));
    await press(controller, "Enter", { ctrl: true });
    const blocks = controller.snapshot().document.blocks;
    assert.equal(blocks.length, 3);
    const [first, second] = blocks;
    assert.equal(first?.id, node("1101"), "original list keeps id and the head items");
    assert.equal(first?.type === "list" ? first.items.length : 0, 1);
    assert.equal(second?.type, "list");
    if (second?.type !== "list") return;
    assert.match(second.id, /^node_[0-9a-f]{32}$/);
    assert.notEqual(second.id, node("1101"));
    assert.deepEqual(
      second.items.map((entry) => entry.id),
      [item("a102")],
      "tail item id preserved under the new list node",
    );
  });

  it("Ctrl+Enter on the first item refuses (split needs a head)", async () => {
    const controller = new WorkspaceController(twoLists());
    await focusOn(controller, item("a101"));
    const before = controller.snapshot().document;
    await press(controller, "Enter", { ctrl: true });
    assert.match(controller.snapshot().status, /首项处不可拆分/);
    assert.deepEqual(controller.snapshot().document, before);
  });

  it("Enter splits an item's text into a new following item (new item id)", async () => {
    const controller = new WorkspaceController(
      doc([listBlock(node("1101"), [[item("a101"), "甲乙丙丁"]])]),
    );
    await focusOn(controller, item("a101"));
    await press(controller, "ArrowRight");
    await press(controller, "ArrowRight"); // caret between 乙 and 丙
    await press(controller, "Enter");
    const list = controller.snapshot().document.blocks[0];
    assert.equal(list?.type, "list");
    if (list?.type !== "list") return;
    assert.equal(list.items.length, 2);
    assert.deepEqual(
      list.items.map((entry) => [entry.id, entry.text] as const),
      [
        [item("a101"), "甲乙"],
        [list.items[1]?.id ?? "", "丙丁"],
      ],
    );
    assert.notEqual(list.items[1]?.id, item("a101"));
    assert.match(list.items[1]?.id ?? "", /^item_[0-9a-f]{32}$/);
  });
});

describe("A-03 workspace: block order correction + deletion", () => {
  it("Ctrl+ArrowDown moves a block within its container, id preserved", async () => {
    const controller = new WorkspaceController(
      doc([
        { id: node("9001"), type: "paragraph", text: "一" },
        { id: node("9002"), type: "paragraph", text: "二" },
        { id: node("9003"), type: "paragraph", text: "三" },
      ]),
    );
    await focusOn(controller, node("9001"));
    await press(controller, "ArrowDown", { ctrl: true });
    assert.deepEqual(
      controller.snapshot().document.blocks.map((block) => block.id),
      [node("9002"), node("9001"), node("9003")],
    );
    const focused = controller.snapshot().rows[controller.snapshot().focus.rowIndex];
    assert.equal(
      focused?.kind === "paragraph" ? focused.blockId : "",
      node("9001"),
      "focus follows the moved block",
    );
  });

  it("moving past the container edge reports honestly and changes nothing", async () => {
    const controller = new WorkspaceController(
      doc([{ id: node("9001"), type: "paragraph", text: "一" }]),
    );
    const before = controller.snapshot().document;
    await press(controller, "ArrowUp", { ctrl: true });
    assert.match(controller.snapshot().status, /已是容器首块/);
    assert.deepEqual(controller.snapshot().document, before);
  });

  it("Delete on a non-text row removes the focused block through the delete command", async () => {
    const controller = new WorkspaceController(
      doc([
        { id: node("f001"), type: "pageBreak", reason: "source" },
        { id: node("9001"), type: "paragraph", text: "一" },
      ]),
    );
    await press(controller, "Delete");
    assert.deepEqual(
      controller.snapshot().document.blocks.map((block) => block.id),
      [node("9001")],
    );
  });
});

describe("A-03 workspace: table mode", () => {
  const tableDoc = (): WenshuDocument => doc([tableBlock(node("7a01"), 2, 2)]);

  it("Enter enters table mode; Ctrl+Enter inserts a row with fresh row/cell ids", async () => {
    const controller = new WorkspaceController(tableDoc());
    await press(controller, "Enter");
    assert.notEqual(controller.snapshot().focus.table, undefined);
    const beforeIds = new Set(collectIds(controller.snapshot().document.blocks));
    await press(controller, "Enter", { ctrl: true });
    const table = controller.snapshot().document.blocks[0];
    assert.equal(table?.type, "table");
    if (table?.type !== "table") return;
    assert.equal(table.rows.length, 3);
    const newRow = table.rows[1];
    assert.ok(newRow !== undefined);
    assert.equal(beforeIds.has(newRow.id), false, "new row id is fresh");
    newRow.cells.forEach((tableCell, index) => {
      assert.equal(beforeIds.has(tableCell.id), false);
      assert.equal(
        tableCell.columnId,
        table.columns[index]?.id,
        "cell bound to its column",
      );
    });
  });

  it("Delete removes the selected row; last-row deletion rolls back honestly (minItems)", async () => {
    const controller = new WorkspaceController(doc([tableBlock(node("7a01"), 2, 2)]));
    await press(controller, "Enter");
    await press(controller, "Delete");
    let table = controller.snapshot().document.blocks[0];
    assert.equal(table?.type === "table" ? table.rows.length : 0, 1);
    // Now delete the remaining row: schema guard must roll the transaction back.
    const before = controller.snapshot().document;
    await press(controller, "Delete");
    assert.match(controller.snapshot().status, /事务回滚/);
    assert.deepEqual(
      controller.snapshot().document,
      before,
      "rolled back: document untouched",
    );
    table = controller.snapshot().document.blocks[0];
    assert.equal(table?.type === "table" ? table.rows.length : 0, 1);
  });

  it("Ctrl+] inserts a column (cells per row, fresh ids); Ctrl+[ deletes selected column", async () => {
    const controller = new WorkspaceController(tableDoc());
    await press(controller, "Enter");
    await press(controller, "]", { ctrl: true });
    let table = controller.snapshot().document.blocks[0];
    assert.equal(table?.type, "table");
    if (table?.type !== "table") return;
    assert.equal(table.columns.length, 3);
    assert.equal(table.columns[1]?.header, "新列");
    const newColumnId = table.columns[1]?.id;
    table.rows.forEach((tableRow) => {
      assert.equal(tableRow.cells.length, 3);
      assert.equal(tableRow.cells[1]?.columnId, newColumnId);
    });
    // Select the new column (index 1) and delete it.
    await press(controller, "ArrowRight");
    await press(controller, "[", { ctrl: true });
    table = controller.snapshot().document.blocks[0];
    assert.equal(table?.type === "table" ? table.columns.length : 0, 2);
    assert.equal(
      controller.snapshot().focus.table?.column,
      1,
      "selection clamped to last column",
    );
  });

  it("Escape exits table mode without touching the document", async () => {
    const controller = new WorkspaceController(tableDoc());
    await press(controller, "Enter");
    const before = controller.snapshot().document;
    await press(controller, "Escape");
    assert.equal(controller.snapshot().focus.table, undefined);
    assert.deepEqual(controller.snapshot().document, before);
  });
});

describe("A-03 workspace: undo/redo + stable ids", () => {
  it("undo restores the pre-edit document deep-equal; redo replays it; new edit forks redo away", async () => {
    const controller = new WorkspaceController(
      doc([
        { id: node("9001"), type: "paragraph", text: "第一" },
        { id: node("9002"), type: "paragraph", text: "第二" },
      ]),
    );
    const initial = controller.snapshot().document;
    await focusOn(controller, node("9002"));
    await press(controller, "X"); // append X to 第二
    const edited = controller.snapshot().document;
    assert.notDeepEqual(edited, initial);
    await press(controller, "z", { ctrl: true });
    assert.deepEqual(
      controller.snapshot().document,
      initial,
      "undo is a real roundtrip",
    );
    await press(controller, "y", { ctrl: true });
    assert.deepEqual(
      controller.snapshot().document,
      edited,
      "redo replays the same snapshot",
    );
    await press(controller, "z", { ctrl: true });
    await press(controller, "Y"); // fork: different edit
    assert.equal(
      controller.snapshot().redoDepth,
      0,
      "redo stack cleared after a diverging edit",
    );
    await press(controller, "y", { ctrl: true });
    assert.match(controller.snapshot().status, /没有可重做/);
  });

  it("undo on an empty history reports honestly", async () => {
    const controller = new WorkspaceController(
      doc([{ id: node("9001"), type: "paragraph", text: "一" }]),
    );
    await press(controller, "z", { ctrl: true });
    assert.match(controller.snapshot().status, /没有可撤销/);
  });

  it("a 16-step seeded structural sequence preserves every id it never removed", async () => {
    const controller = new WorkspaceController(
      doc([
        { id: node("9001"), type: "paragraph", text: "第一段" },
        listBlock(node("1101"), [
          [item("a101"), "甲"],
          [item("a102"), "乙"],
        ]),
        tableBlock(node("7a01"), 2, 2),
        { id: node("9004"), type: "paragraph", text: "收尾" },
      ]),
    );
    const anchorIds = [
      node("9001"),
      node("1101"),
      item("a101"),
      item("a102"),
      node("7a01"),
      node("9004"),
    ];
    // Deterministic sequence: move block, edit text, table row + column churn, undo/redo.
    await focusOn(controller, node("9004"));
    await press(controller, "ArrowUp", { ctrl: true }); // move up over table
    await press(controller, "ArrowUp", { ctrl: true }); // move up over list
    await focusOn(controller, item("a101"));
    await press(controller, "Z"); // type into first item
    await focusOn(controller, node("7a01"));
    await press(controller, "Enter"); // table mode
    await press(controller, "Enter", { ctrl: true }); // + row
    await press(controller, "]", { ctrl: true }); // + column
    await press(controller, "Escape");
    await press(controller, "z", { ctrl: true }); // undo column insert
    await press(controller, "y", { ctrl: true }); // redo it
    const ids = collectIds(controller.snapshot().document.blocks);
    anchorIds.forEach((id) => {
      assert.ok(ids.includes(id), `anchor id ${id} survived the sequence`);
    });
    assert.equal(new Set(ids).size, ids.length, "no duplicate ids after the sequence");
    assert.equal(
      controller.snapshot().undoDepth,
      5,
      "five committed transactions (moves×2, type, row, column)",
    );
  });
});
