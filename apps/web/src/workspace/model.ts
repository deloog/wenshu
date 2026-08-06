import type { SupportedDocument } from "@wenshu/document-model";

export type WorkspacePhase = "confirm" | "editing";

export interface FailedAsset {
  readonly fileName: string;
  readonly reasonCode: string;
}

/** Real import-terminal metadata (A-02 channel payload), drives D1's summary. */
export interface ImportMeta {
  readonly status: "success" | "partial";
  readonly materialName: string;
  readonly importedAssets: readonly string[];
  readonly failedAssets: readonly FailedAsset[];
}

export interface StructureSummary {
  readonly title: string;
  readonly totalBlocks: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly maxDepth: number;
}

export type TextRowKind = "heading" | "paragraph" | "quote" | "item";

export type RowModel =
  | {
      readonly kind: "heading";
      readonly blockId: string;
      readonly level: number;
      readonly text: string;
    }
  | { readonly kind: "paragraph"; readonly blockId: string; readonly text: string }
  | { readonly kind: "quote"; readonly blockId: string; readonly text: string }
  | {
      readonly kind: "item";
      readonly listId: string;
      readonly itemId: string;
      readonly ordered: boolean;
      readonly ordinal: number;
      readonly text: string;
    }
  | {
      readonly kind: "table";
      readonly blockId: string;
      readonly headers: readonly string[];
      readonly cells: readonly (readonly string[])[];
      readonly rowIds: readonly string[];
      readonly columnIds: readonly string[];
    }
  | {
      readonly kind: "figure";
      readonly blockId: string;
      readonly altText: string;
      readonly caption: string | undefined;
    }
  | { readonly kind: "pageBreak"; readonly blockId: string }
  | { readonly kind: "toc"; readonly blockId: string };

export interface TableMode {
  readonly row: number;
  readonly column: number;
}

export interface FocusState {
  readonly rowIndex: number;
  readonly offset: number;
  readonly table: TableMode | undefined;
}

export type ConfirmationOutcome = "confirmed" | "skipped";

export interface WorkspaceSnapshot {
  readonly phase: WorkspacePhase;
  readonly title: string;
  readonly summary: StructureSummary;
  readonly importMeta: ImportMeta | undefined;
  readonly confirmationOutcome: ConfirmationOutcome | undefined;
  readonly rows: readonly RowModel[];
  readonly focus: FocusState;
  readonly status: string;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly document: SupportedDocument;
}

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/** Container membership of every block, rebuilt per refresh (move/split ops). */
export interface BlockLocation {
  readonly parentId: string;
  readonly index: number;
}

export const TEXT_ROW_KINDS: readonly TextRowKind[] = [
  "heading",
  "paragraph",
  "quote",
  "item",
];
