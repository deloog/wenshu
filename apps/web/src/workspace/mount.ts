import type { RowModel, WorkspaceSnapshot } from "./model.ts";
import { isTextRow } from "./rows.ts";
import { renderConfirmation } from "./confirm.ts";
import type { WorkspaceController } from "./controller.ts";

const CARET = "▏";

const KEY_HINT =
  "↑↓ 选行 · ←→ 移光标 · Enter 拆分 · Backspace/Delete 删字 · Tab 标题级别 · " +
  "Ctrl+T 段落↔标题 · Ctrl+M 合并列表 · Ctrl+Enter 拆列表 · Ctrl+↑↓ 移块 · " +
  "Ctrl+Z/Y 撤销重做 · 表格行 Enter 进入行模式";

/**
 * Thin DOM mount for the A-03 keyboard-first workspace. Text-only rendering
 * via textContent (no innerHTML injection surface); the whole editor is one
 * focusable region (Tab 序只有一项，焦点可见由 outline + aria-current 承担)，
 * all editing semantics live in the controller — this file only reflects
 * snapshots and forwards key events.
 */
export function mountWorkspace(
  root: HTMLElement,
  controller: WorkspaceController,
): void {
  const heading = document.createElement("h2");
  heading.textContent = "编辑工作区（A-03 键盘优先）";

  const editor = document.createElement("section");
  editor.tabIndex = 0;
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");
  editor.setAttribute("aria-label", "文档编辑工作区");
  editor.style.outline = "2px solid transparent";
  editor.addEventListener("focus", () => {
    editor.style.outline = "2px solid #1a56db";
  });
  editor.addEventListener("blur", () => {
    editor.style.outline = "2px solid transparent";
  });

  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");

  const meta = document.createElement("p");
  const hint = document.createElement("p");

  root.append(heading, editor, status, meta, hint);

  function render(snapshot: WorkspaceSnapshot): void {
    editor.replaceChildren();
    if (snapshot.phase === "confirm") {
      renderConfirmation(editor, snapshot);
    } else {
      snapshot.rows.forEach((row, index) => {
        editor.append(renderRow(row, snapshot, index));
      });
    }
    status.textContent = `状态：${snapshot.status}`;
    meta.textContent =
      `撤销深度 ${snapshot.undoDepth} · 重做深度 ${snapshot.redoDepth}` +
      (snapshot.confirmationOutcome !== undefined
        ? ` · 结构确认：${snapshot.confirmationOutcome === "confirmed" ? "已确认" : "已跳过"}`
        : "");
    hint.textContent = KEY_HINT;
  }

  function renderRow(
    row: RowModel,
    snapshot: WorkspaceSnapshot,
    index: number,
  ): HTMLElement {
    const line = document.createElement("div");
    line.dataset["rowIndex"] = String(index);
    if ("blockId" in row) line.dataset["blockId"] = row.blockId;
    if (row.kind === "item") line.dataset["itemId"] = row.itemId;
    const focused = snapshot.focus.rowIndex === index;
    if (focused) {
      line.style.outline = "1px solid #1a56db";
      line.setAttribute("aria-current", "true");
    }
    line.textContent = rowText(row, snapshot, focused);
    return line;
  }

  function rowText(
    row: RowModel,
    snapshot: WorkspaceSnapshot,
    focused: boolean,
  ): string {
    if (isTextRow(row)) {
      const text =
        focused && snapshot.focus.table === undefined
          ? `${row.text.slice(0, snapshot.focus.offset)}${CARET}${row.text.slice(snapshot.focus.offset)}`
          : row.text;
      switch (row.kind) {
        case "heading":
          return `${"#".repeat(row.level)} ${text}`;
        case "quote":
          return `❝ ${text}`;
        case "item":
          return `${row.ordered ? `${row.ordinal}.` : "•"} ${text}`;
        case "paragraph":
          return text;
      }
    }
    if (row.kind === "table") {
      const header = `表 ${row.headers.join(" | ")}`;
      const body = row.cells.map((cells, rowIndex) => {
        const marks = cells.map((cell, columnIndex) => {
          const selected =
            focused &&
            snapshot.focus.table !== undefined &&
            snapshot.focus.table.row === rowIndex &&
            snapshot.focus.table.column === columnIndex;
          return selected ? `[${cell || " "}]` : cell || " ";
        });
        return `  ${marks.join(" | ")}`;
      });
      return [header, ...body].join("\n");
    }
    if (row.kind === "figure") {
      return `[图] ${row.altText}${row.caption !== undefined ? `（${row.caption}）` : ""}`;
    }
    if (row.kind === "pageBreak") return "—— 分页 ——";
    return "[目录]";
  }

  editor.addEventListener("keydown", (event) => {
    const key = {
      key: event.key,
      ctrlKey: event.ctrlKey || event.metaKey,
      shiftKey: event.shiftKey,
    };
    void controller.handleKey(key).then((consumed) => {
      if (consumed) {
        event.preventDefault();
        render(controller.snapshot());
      }
    });
  });

  render(controller.snapshot());
  editor.focus();
}
