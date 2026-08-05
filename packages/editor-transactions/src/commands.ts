import type { Block } from "@wenshu/document-model";

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
