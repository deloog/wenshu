import type { EditorCommand } from "@wenshu/editor-transactions";

import type { RowModel, TableMode } from "./model.ts";
import type { WorkspaceController } from "./controller.ts";

type HeadingRow = Extract<RowModel, { kind: "heading" }>;
type ParagraphRow = Extract<RowModel, { kind: "paragraph" }>;
type ItemRow = Extract<RowModel, { kind: "item" }>;
type TableRow = Extract<RowModel, { kind: "table" }>;

/** Tab / Shift+Tab on a heading: level clamp 1–6 (schema range). */
export async function headingLevel(
  controller: WorkspaceController,
  row: HeadingRow,
  delta: number,
): Promise<void> {
  const block = controller.blocks.get(row.blockId);
  if (block?.type !== "section") return;
  const level = Math.min(Math.max(block.level + delta, 1), 6);
  if (level === block.level) {
    controller.setStatus(`标题级别已达${delta > 0 ? "最深 6" : "最浅 1"}`);
    return;
  }
  const command: EditorCommand = {
    kind: "rewrite",
    id: row.blockId,
    replacement: { ...block, level },
  };
  await controller.applyCommand(`标题级别 ${block.level} → ${level}`, command);
  controller.restoreFocus(row.blockId, controller.offset);
}

/** D1 节点类型纠正：段落被包进一个以其文本为标题的新节（段落 ID 保留为子块）。 */
export async function promoteParagraphAction(
  controller: WorkspaceController,
  row: ParagraphRow,
): Promise<boolean> {
  await controller.applyCommand(
    "已提升：段落包入以其文本为标题的新节（段落 ID 保留，Tab 调整级别）",
    {
      kind: "promote-paragraph",
      paragraphId: row.blockId,
      level: 1,
    },
  );
  controller.restoreFocus(row.blockId, controller.offset);
  return true;
}

/** D1 反向纠正：标题节 → 段落（标题变新段落节点，子块 ID 全保留）。 */
export async function demoteSectionAction(
  controller: WorkspaceController,
  row: HeadingRow,
): Promise<boolean> {
  await controller.applyCommand("已降级为段落（D1 反向纠正）", {
    kind: "demote-section",
    sectionId: row.blockId,
  });
  controller.restoreFocus(row.blockId, controller.offset);
  return true;
}

/** 相邻同 ordered 列表合并（项 ID 保留）；有序/无序不同 fail-closed。 */
export async function mergeListWithNext(
  controller: WorkspaceController,
  row: ItemRow,
): Promise<boolean> {
  const location = controller.locations.get(row.listId);
  if (location === undefined) return false;
  const parent = controller.containerBlocks(location.parentId);
  const next = parent?.[location.index + 1];
  if (next?.type !== "list") {
    controller.setStatus("下一兄弟不是列表，无法合并");
    return true;
  }
  const current = controller.blocks.get(row.listId);
  if (current?.type !== "list" || current.ordered !== next.ordered) {
    controller.setStatus("有序/无序列表不同，不静默转换（fail-closed）");
    return true;
  }
  await controller.applyCommand("已合并相邻列表（项 ID 保持）", {
    kind: "merge-lists",
    sourceId: next.id,
    destinationId: row.listId,
  });
  controller.restoreFocus(row.itemId, controller.offset);
  return true;
}

/** 在当前项之前拆分列表（项 ID 保留，新 list 节点获新 ID）。 */
export async function splitListAction(
  controller: WorkspaceController,
  row: ItemRow,
): Promise<boolean> {
  const list = controller.blocks.get(row.listId);
  if (list?.type !== "list") return false;
  const itemIndex = list.items.findIndex((item) => item.id === row.itemId);
  if (itemIndex <= 0) {
    controller.setStatus("首项处不可拆分列表");
    return true;
  }
  await controller.applyCommand("已拆分列表（项 ID 保持）", {
    kind: "split-list",
    listId: row.listId,
    beforeItemId: row.itemId,
  });
  controller.restoreFocus(row.itemId, controller.offset);
  return true;
}

/** Ctrl+ArrowUp/Down：同容器内上/下移一块（D1 顺序纠正）。 */
export async function moveFocusedBlock(
  controller: WorkspaceController,
  row: RowModel & { blockId: string },
  delta: number,
): Promise<boolean> {
  const location = controller.locations.get(row.blockId);
  if (location === undefined) return false;
  const parent = controller.containerBlocks(location.parentId);
  if (parent === undefined) return false;
  const target = location.index + delta;
  if (target < 0 || target >= parent.length) {
    controller.setStatus(delta < 0 ? "已是容器首块" : "已是容器末块");
    return true;
  }
  await controller.applyCommand(delta < 0 ? "已上移一块" : "已下移一块", {
    kind: "move",
    id: row.blockId,
    destinationParentId: location.parentId,
    destinationIndex: target,
  });
  controller.restoreFocus(row.blockId, controller.offset);
  return true;
}

/** Delete on a non-text row: remove the focused block (delete command). */
export async function deleteFocusedBlock(
  controller: WorkspaceController,
  row: RowModel & { blockId: string },
): Promise<boolean> {
  return controller.applyCommand("已删除焦点块", { kind: "delete", id: row.blockId });
}

/** Ctrl+Backspace on an item row: remove the single item. */
export async function deleteFocusedListItem(
  controller: WorkspaceController,
  row: ItemRow,
): Promise<boolean> {
  return controller.applyCommand("已删除列表项", {
    kind: "delete-list-item",
    itemId: row.itemId,
  });
}

export async function tableInsertRow(
  controller: WorkspaceController,
  row: TableRow,
  mode: TableMode,
): Promise<boolean> {
  await controller.applyCommand("已插入表格行", {
    kind: "insert-table-row",
    tableId: row.blockId,
    rowIndex: mode.row + 1,
  });
  controller.clampTableMode();
  return true;
}

export async function tableDeleteRow(
  controller: WorkspaceController,
  row: TableRow,
  mode: TableMode,
): Promise<boolean> {
  const rowId = row.rowIds[mode.row];
  if (rowId === undefined) return false;
  await controller.applyCommand("已删除表格行", { kind: "delete-table-row", rowId });
  controller.clampTableMode();
  return true;
}

export async function tableInsertColumn(
  controller: WorkspaceController,
  row: TableRow,
  mode: TableMode,
): Promise<boolean> {
  await controller.applyCommand(
    "已插入表格列（默认表头「新列」，契约 minLength 1 不允许空表头）",
    {
      kind: "insert-table-column",
      tableId: row.blockId,
      header: "新列",
      align: "start",
      columnIndex: mode.column + 1,
    },
  );
  controller.clampTableMode();
  return true;
}

export async function tableDeleteColumn(
  controller: WorkspaceController,
  row: TableRow,
  mode: TableMode,
): Promise<boolean> {
  const columnId = row.columnIds[mode.column];
  if (columnId === undefined) return false;
  await controller.applyCommand("已删除表格列", {
    kind: "delete-table-column",
    columnId,
  });
  controller.clampTableMode();
  return true;
}
