import type { Block, SupportedDocument } from "@wenshu/document-model";

import type { BlockLocation, RowModel, StructureSummary } from "./model.ts";

export interface Flattened {
  readonly rows: readonly RowModel[];
  /** blockId -> container membership (document.documentId for top level). */
  readonly locations: ReadonlyMap<string, BlockLocation>;
  readonly blocks: ReadonlyMap<string, Block>;
}

/** Depth-first flatten into keyboard-addressable rows (section = heading row). */
export function flattenDocument(document: SupportedDocument): Flattened {
  const rows: RowModel[] = [];
  const locations = new Map<string, BlockLocation>();
  const blocks = new Map<string, Block>();
  const visit = (block: Block, parentId: string, index: number): void => {
    blocks.set(block.id, block);
    locations.set(block.id, { parentId, index });
    switch (block.type) {
      case "section":
        rows.push({
          kind: "heading",
          blockId: block.id,
          level: block.level,
          text: block.title,
        });
        block.children.forEach((child, childIndex) =>
          visit(child, block.id, childIndex),
        );
        return;
      case "paragraph":
        rows.push({ kind: "paragraph", blockId: block.id, text: block.text });
        return;
      case "quote":
        rows.push({ kind: "quote", blockId: block.id, text: block.text });
        return;
      case "list":
        block.items.forEach((item, itemIndex) =>
          rows.push({
            kind: "item",
            listId: block.id,
            itemId: item.id,
            ordered: block.ordered,
            ordinal: itemIndex + 1,
            text: item.text,
          }),
        );
        return;
      case "table":
        rows.push({
          kind: "table",
          blockId: block.id,
          headers: block.columns.map((column) => column.header),
          cells: block.rows.map((row) => row.cells.map((cell) => cell.text)),
          rowIds: block.rows.map((row) => row.id),
          columnIds: block.columns.map((column) => column.id),
        });
        return;
      case "figure":
        rows.push({
          kind: "figure",
          blockId: block.id,
          altText: block.altText,
          caption: block.caption,
        });
        return;
      case "pageBreak":
        rows.push({ kind: "pageBreak", blockId: block.id });
        return;
      case "toc":
        rows.push({ kind: "toc", blockId: block.id });
        return;
    }
  };
  document.blocks.forEach((block, index) => visit(block, document.documentId, index));
  return { rows, locations, blocks };
}

/** D1 confirmation surface: block counts, nesting depth (structure summary). */
export function summarizeDocument(document: SupportedDocument): StructureSummary {
  const counts: Record<string, number> = {};
  let totalBlocks = 0;
  let maxDepth = 0;
  const visit = (block: Block, depth: number): void => {
    totalBlocks += 1;
    maxDepth = Math.max(maxDepth, depth);
    counts[block.type] = (counts[block.type] ?? 0) + 1;
    if (block.type === "section") {
      block.children.forEach((child) => visit(child, depth + 1));
    }
  };
  document.blocks.forEach((block) => visit(block, 1));
  return Object.freeze({
    title: document.title,
    totalBlocks,
    counts: Object.freeze(counts),
    maxDepth,
  });
}

export function rowIdentity(row: RowModel): string {
  return row.kind === "item" ? row.itemId : row.blockId;
}

export type TextRow = Extract<
  RowModel,
  { kind: "heading" | "paragraph" | "quote" | "item" }
>;

export function isTextRow(row: RowModel | undefined): row is TextRow {
  return (
    row !== undefined &&
    (row.kind === "heading" ||
      row.kind === "paragraph" ||
      row.kind === "quote" ||
      row.kind === "item")
  );
}
