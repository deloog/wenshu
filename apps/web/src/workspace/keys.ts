import type { KeyLike } from "./model.ts";
import { isTextRow } from "./rows.ts";
import type { WorkspaceController } from "./controller.ts";
import { backspace, forwardDelete, insertText, splitTextRow } from "./text-actions.ts";
import {
  deleteFocusedBlock,
  deleteFocusedListItem,
  demoteSectionAction,
  headingLevel,
  mergeListWithNext,
  moveFocusedBlock,
  promoteParagraphAction,
  splitListAction,
  tableDeleteColumn,
  tableDeleteRow,
  tableInsertColumn,
  tableInsertRow,
} from "./structure-actions.ts";

/**
 * A-03 keyboard map (keyboard-only workspace, no mouse affordances):
 *   ↑↓ focus row · ←→ caret · printable = insert at caret
 *   Enter = split paragraph/item · Backspace = delete char / merge paragraph
 *   Tab / Shift+Tab = heading level · Ctrl+T = paragraph↔heading (D1)
 *   Ctrl+M = merge with next list · Ctrl+Enter = split list (item rows)
 *   Ctrl+ArrowUp/Down = move block · Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z = undo/redo
 *   Delete = forward delete char, or delete focused non-text block
 *   Ctrl+Backspace = delete list item
 *   On a table row Enter enters table mode: ↑↓←→ pick cell, Ctrl+Enter
 *   insert row, Delete delete row, Ctrl+] insert column, Ctrl+[ delete
 *   column, Esc exits table mode.
 * Confirm phase (import terminal only): Enter = confirm, Esc = skip.
 */
export async function dispatchWorkspaceKey(
  controller: WorkspaceController,
  key: KeyLike,
): Promise<boolean> {
  if (controller.phase === "confirm") {
    if (key.key === "Enter") {
      controller.enterWorkspace("confirmed");
      return true;
    }
    if (key.key === "Escape") {
      controller.enterWorkspace("skipped");
      return true;
    }
    return false;
  }
  if (controller.tableMode !== undefined) return dispatchTableMode(controller, key);
  if (key.ctrlKey) return dispatchCtrl(controller, key);
  const row = controller.rows[controller.focusRow];
  switch (key.key) {
    case "ArrowUp":
    case "ArrowDown":
      controller.moveFocus(key.key === "ArrowUp" ? -1 : 1);
      return true;
    case "ArrowLeft":
      return controller.moveCaret(-1);
    case "ArrowRight":
      return controller.moveCaret(1);
    case "Tab":
      if (row?.kind === "heading") {
        await headingLevel(controller, row, key.shiftKey ? -1 : 1);
        return true;
      }
      return false;
    case "Enter":
      if (row?.kind === "table") {
        controller.setTableMode({ row: 0, column: 0 });
        controller.setStatus(
          "表格行模式：↑↓ 选行 ←→ 选列，Ctrl+Enter 插行，Delete 删行，Ctrl+] 插列，Ctrl+[ 删列，Esc 退出",
        );
        return true;
      }
      if (isTextRow(row)) return splitTextRow(controller, row);
      return false;
    case "Backspace":
      if (isTextRow(row)) return backspace(controller, row);
      return false;
    case "Delete":
      if (isTextRow(row)) return forwardDelete(controller, row);
      if (row !== undefined && "blockId" in row)
        return deleteFocusedBlock(controller, row);
      return false;
    default:
      if (key.key.length === 1 && isTextRow(row))
        return insertText(controller, row, key.key);
      return false;
  }
}

async function dispatchCtrl(
  controller: WorkspaceController,
  key: KeyLike,
): Promise<boolean> {
  const row = controller.rows[controller.focusRow];
  switch (key.key) {
    case "z":
      return key.shiftKey ? controller.redo() : controller.undo();
    case "y":
      return controller.redo();
    case "t":
    case "T":
      if (row?.kind === "paragraph") return promoteParagraphAction(controller, row);
      if (row?.kind === "heading") return demoteSectionAction(controller, row);
      return false;
    case "m":
    case "M":
      if (row?.kind === "item") return mergeListWithNext(controller, row);
      return false;
    case "Enter":
      if (row?.kind === "item") return splitListAction(controller, row);
      return false;
    case "Backspace":
      if (row?.kind === "item") return deleteFocusedListItem(controller, row);
      return false;
    case "ArrowUp":
    case "ArrowDown":
      if (row !== undefined && "blockId" in row) {
        return moveFocusedBlock(controller, row, key.key === "ArrowUp" ? -1 : 1);
      }
      return false;
    default:
      return false;
  }
}

async function dispatchTableMode(
  controller: WorkspaceController,
  key: KeyLike,
): Promise<boolean> {
  const row = controller.rows[controller.focusRow];
  const mode = controller.tableMode;
  if (row?.kind !== "table" || mode === undefined) {
    controller.setTableMode(undefined);
    return false;
  }
  switch (key.key) {
    case "Escape":
      controller.setTableMode(undefined);
      controller.setStatus("已退出表格行模式");
      return true;
    case "ArrowUp":
      controller.setTableMode({ ...mode, row: Math.max(0, mode.row - 1) });
      return true;
    case "ArrowDown":
      controller.setTableMode({
        ...mode,
        row: Math.min(row.rowIds.length - 1, mode.row + 1),
      });
      return true;
    case "ArrowLeft":
      controller.setTableMode({ ...mode, column: Math.max(0, mode.column - 1) });
      return true;
    case "ArrowRight":
      controller.setTableMode({
        ...mode,
        column: Math.min(row.columnIds.length - 1, mode.column + 1),
      });
      return true;
    case "Enter":
      return key.ctrlKey ? tableInsertRow(controller, row, mode) : false;
    case "Delete":
      return tableDeleteRow(controller, row, mode);
    case "]":
      return key.ctrlKey ? tableInsertColumn(controller, row, mode) : false;
    case "[":
      return key.ctrlKey ? tableDeleteColumn(controller, row, mode) : false;
    default:
      return false;
  }
}
