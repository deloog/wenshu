import type { Block } from "@wenshu/document-model";
import type { EditorCommand } from "@wenshu/editor-transactions";

import { rowIdentity, type TextRow } from "./rows.ts";
import type { WorkspaceController } from "./controller.ts";

/** Placeholder id for insert commands; the manager's allocator re-mints it. */
const PLACEHOLDER_ID = "node_00000000000000000000000000000000";

const EMPTY_TEXT_GUARD = "空块不入契约（minLength 1）——仅在文本中间拆分，或先输入内容";

/** Build the rewrite command that puts `text` into the focused text row. */
export function rewriteTextCommand(
  controller: WorkspaceController,
  row: TextRow,
  text: string,
): EditorCommand | undefined {
  if (row.kind === "item") {
    const list = controller.blocks.get(row.listId);
    if (list?.type !== "list") return undefined;
    return {
      kind: "rewrite",
      id: row.listId,
      replacement: {
        ...list,
        items: list.items.map((item) =>
          item.id === row.itemId ? { ...item, text } : item,
        ),
      },
    };
  }
  const block = controller.blocks.get(row.blockId);
  if (block === undefined) return undefined;
  if (row.kind === "heading" && block.type === "section") {
    return { kind: "rewrite", id: row.blockId, replacement: { ...block, title: text } };
  }
  if (row.kind === "paragraph" && block.type === "paragraph") {
    return { kind: "rewrite", id: row.blockId, replacement: { ...block, text } };
  }
  if (row.kind === "quote" && block.type === "quote") {
    return { kind: "rewrite", id: row.blockId, replacement: { ...block, text } };
  }
  return undefined;
}

/** Printable character input: insert at the caret. */
export async function insertText(
  controller: WorkspaceController,
  row: TextRow,
  text: string,
): Promise<boolean> {
  const command = rewriteTextCommand(
    controller,
    row,
    `${row.text.slice(0, controller.offset)}${text}${row.text.slice(controller.offset)}`,
  );
  if (command === undefined) return false;
  await controller.applyCommand("已输入", command);
  controller.restoreFocus(rowIdentity(row), controller.offset + text.length);
  return true;
}

/**
 * Backspace: inside text deletes the previous character; at a paragraph
 * start merges into the previous paragraph (same container only); other
 * block kinds fail closed with an honest status instead of inventing merge
 * semantics (heading/list merges are out of A-03's keyboard set).
 */
export async function backspace(
  controller: WorkspaceController,
  row: TextRow,
): Promise<boolean> {
  if (controller.offset > 0) {
    const command = rewriteTextCommand(
      controller,
      row,
      row.text.slice(0, controller.offset - 1) + row.text.slice(controller.offset),
    );
    if (command === undefined) return false;
    await controller.applyCommand("已删除字符", command);
    controller.restoreFocus(rowIdentity(row), controller.offset - 1);
    return true;
  }
  if (row.kind !== "paragraph") {
    controller.setStatus("段首退格：仅段落可与上一段落合并");
    return true;
  }
  const location = controller.locations.get(row.blockId);
  const previousRow = controller.rows[controller.focusRow - 1];
  if (location === undefined || previousRow?.kind !== "paragraph") {
    controller.setStatus("段首退格：上一行不是同容器段落，不合并");
    return true;
  }
  const previousLocation = controller.locations.get(previousRow.blockId);
  if (previousLocation?.parentId !== location.parentId) {
    controller.setStatus("段首退格：跨节段落不合并");
    return true;
  }
  const caret = previousRow.text.length;
  const rewrite = rewriteTextCommand(
    controller,
    previousRow,
    previousRow.text + row.text,
  );
  if (rewrite === undefined) return false;
  await controller.run("已合并段落", (session) => {
    session.apply(rewrite);
    session.apply({ kind: "delete", id: row.blockId });
  });
  controller.restoreFocus(previousRow.blockId, caret);
  return true;
}

/** Delete (forward): delete the character after the caret, if any. */
export async function forwardDelete(
  controller: WorkspaceController,
  row: TextRow,
): Promise<boolean> {
  if (controller.offset >= row.text.length) return true;
  const command = rewriteTextCommand(
    controller,
    row,
    row.text.slice(0, controller.offset) + row.text.slice(controller.offset + 1),
  );
  if (command === undefined) return false;
  await controller.applyCommand("已前向删除字符", command);
  controller.restoreFocus(rowIdentity(row), controller.offset);
  return true;
}

/**
 * Enter on a text row: split paragraph/list item at the caret. Both halves
 * must satisfy BodyText minLength 1, otherwise fail closed with guidance.
 * Heading/quote splits are not in A-03's keyboard set (heading level is a
 * Tab concern); they report an honest status.
 */
export async function splitTextRow(
  controller: WorkspaceController,
  row: TextRow,
): Promise<boolean> {
  const beforeText = row.text.slice(0, controller.offset);
  const afterText = row.text.slice(controller.offset);
  if (beforeText.length === 0 || afterText.length === 0) {
    controller.setStatus(EMPTY_TEXT_GUARD);
    return true;
  }
  if (row.kind === "item") {
    const list = controller.blocks.get(row.listId);
    if (list?.type !== "list") return false;
    const itemIndex = list.items.findIndex((item) => item.id === row.itemId);
    if (itemIndex < 0) return false;
    const rewrite = rewriteTextCommand(controller, row, beforeText);
    if (rewrite === undefined) return false;
    await controller.run("已拆分列表项", (session) => {
      session.apply(rewrite);
      session.apply({
        kind: "insert-list-item",
        listId: row.listId,
        itemIndex: itemIndex + 1,
        text: afterText,
      });
    });
    controller.restoreFocus(row.itemId, beforeText.length);
    return true;
  }
  if (row.kind === "heading" || row.kind === "quote") {
    controller.setStatus(
      row.kind === "heading" ? "标题不可拆分（级别用 Tab 调整）" : "引用块暂不支持拆分",
    );
    return true;
  }
  const location = controller.locations.get(row.blockId);
  if (location === undefined) return false;
  const rewrite = rewriteTextCommand(controller, row, beforeText);
  if (rewrite === undefined) return false;
  const insertBlock: Block = { id: PLACEHOLDER_ID, type: "paragraph", text: afterText };
  await controller.run("已拆分段落", (session) => {
    session.apply(rewrite);
    session.apply({
      kind: "insert",
      parentId: location.parentId,
      block: insertBlock,
      insertIndex: location.index + 1,
    });
  });
  controller.restoreFocus(row.blockId, beforeText.length);
  return true;
}
