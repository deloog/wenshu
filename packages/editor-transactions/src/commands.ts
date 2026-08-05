import type { Block, SupportedDocument } from "@wenshu/document-model";

export type EditorActor = "human" | "ai";

/**
 * The command vocabulary accepted at the PB-03 write boundary. The first
 * five kinds are the frozen PB-03 set (semantics unchanged); the A-03 kinds
 * (ADR-0030 D1/D3) are additive and map to the structural primitives that
 * preserve every identity they do not explicitly remove.
 */
export type EditorCommand =
  | {
      readonly kind: "insert";
      readonly parentId: string;
      readonly block: Block;
      readonly insertIndex?: number;
    }
  | { readonly kind: "delete"; readonly id: string }
  | {
      readonly kind: "move";
      readonly id: string;
      readonly destinationParentId: string;
      readonly destinationIndex?: number;
    }
  | { readonly kind: "rewrite"; readonly id: string; readonly replacement: Block }
  | {
      readonly kind: "copy";
      readonly id: string;
      readonly destinationParentId: string;
    }
  | {
      readonly kind: "insert-table-row";
      readonly tableId: string;
      readonly rowIndex?: number;
    }
  | { readonly kind: "delete-table-row"; readonly rowId: string }
  | {
      readonly kind: "insert-table-column";
      readonly tableId: string;
      readonly header: string;
      readonly align: "start" | "center" | "end";
      readonly columnIndex?: number;
    }
  | { readonly kind: "delete-table-column"; readonly columnId: string }
  | {
      readonly kind: "merge-lists";
      readonly sourceId: string;
      readonly destinationId: string;
    }
  | {
      readonly kind: "split-list";
      readonly listId: string;
      readonly beforeItemId: string;
    }
  | {
      readonly kind: "promote-paragraph";
      readonly paragraphId: string;
      readonly level: number;
    }
  | { readonly kind: "demote-section"; readonly sectionId: string }
  | {
      readonly kind: "insert-list-item";
      readonly listId: string;
      readonly itemIndex: number;
      readonly text: string;
    }
  | { readonly kind: "delete-list-item"; readonly itemId: string };

/* --------------------------------------------------------------------------
 * A-03 MAJOR-2 remediation: INDEPENDENT removal accounting for the guard.
 *
 * The PB-03 stable-ID guard judges removals from the command plus the
 * pre-command document — never from the operation's own `removedNodeIds`
 * self-declaration: an operation that listed its collateral deletions in its
 * own report would be licensing itself (audit probe: merge-lists dropping an
 * extra sibling item and declaring it COMMITTED). computeExpectedRemovals is
 * the session-side source of truth; the raw ops' removedNodeIds remains an
 * informational return value only. Unknown targets yield [] — the raw
 * operation then fails closed on its own.
 * ------------------------------------------------------------------------ */

function collectSubtreeIds(block: Block): string[] {
  const ids = [block.id];
  if (block.type === "section") {
    block.children.forEach((child) => ids.push(...collectSubtreeIds(child)));
  } else if (block.type === "list") {
    block.items.forEach((entry) => ids.push(entry.id));
  } else if (block.type === "table") {
    block.columns.forEach((column) => ids.push(column.id));
    block.rows.forEach((tableRow) => {
      ids.push(tableRow.id);
      tableRow.cells.forEach((tableCell) => ids.push(tableCell.id));
    });
  }
  return ids;
}

function findBlock(
  blocks: readonly Block[],
  predicate: (block: Block) => boolean,
): Block | undefined {
  for (const block of blocks) {
    if (predicate(block)) return block;
    if (block.type === "section") {
      const nested = findBlock(block.children, predicate);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/**
 * Identities the command is ALLOWED to remove, computed from the command and
 * the pre-command document (session side). All other kinds remove nothing.
 */
export function computeExpectedRemovals(
  command: EditorCommand,
  document: SupportedDocument,
): readonly string[] {
  switch (command.kind) {
    case "delete": {
      const target = findBlock(document.blocks, (block) => block.id === command.id);
      return target === undefined ? [] : collectSubtreeIds(target);
    }
    case "delete-table-row": {
      const table = findBlock(
        document.blocks,
        (block) =>
          block.type === "table" &&
          block.rows.some((entry) => entry.id === command.rowId),
      );
      if (table?.type !== "table") return [];
      const target = table.rows.find((entry) => entry.id === command.rowId);
      return target === undefined
        ? []
        : [target.id, ...target.cells.map((tableCell) => tableCell.id)];
    }
    case "delete-table-column": {
      const table = findBlock(
        document.blocks,
        (block) =>
          block.type === "table" &&
          block.columns.some((column) => column.id === command.columnId),
      );
      if (table?.type !== "table") return [];
      return [
        command.columnId,
        ...table.rows.flatMap((entry) =>
          entry.cells
            .filter((tableCell) => tableCell.columnId === command.columnId)
            .map((tableCell) => tableCell.id),
        ),
      ];
    }
    case "delete-list-item":
      return [command.itemId];
    case "demote-section":
      return [command.sectionId];
    case "merge-lists":
      return [command.sourceId];
    default:
      return [];
  }
}
