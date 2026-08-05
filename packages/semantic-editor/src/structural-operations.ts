import type { List, SupportedDocument, Table } from "@wenshu/document-model";

import { fromProseMirrorDocument, type ProseMirrorDocument } from "./adapter.ts";
import type { IdAllocator } from "./ids.ts";
import {
  allocateUnique,
  checkedResult,
  cloneDocument,
  collectDocumentIds,
  findBlock,
  rejectMissing,
  type EditResult,
} from "./operations.ts";

/**
 * A-03 additive structural operations (ADR-0030 D1/D3): table row/column
 * edits and list merge/split/section demote/promote that the five PB-02 block
 * primitives cannot express without violating their own ID guards (rewrite
 * forbids descendant-set changes; delete+insert rebuilds would reallocate
 * unaffected identities). Every operation preserves every identity it does
 * not explicitly remove, and reports removals via EditResult.removedNodeIds
 * so PB-03 deletion accounting stays exact.
 */

interface TableLocation {
  readonly table: Table;
  readonly tableId: string;
}

function findTable(
  blocks: SupportedDocument["blocks"],
  id: string,
): TableLocation | undefined {
  for (const block of blocks) {
    if (block.type === "table" && block.id === id) {
      return { table: block, tableId: block.id };
    }
    if (block.type === "section") {
      const nested = findTable(block.children, id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function findTableByRow(
  blocks: SupportedDocument["blocks"],
  rowId: string,
): (TableLocation & { readonly rowIndex: number }) | undefined {
  for (const block of blocks) {
    if (block.type === "table") {
      const rowIndex = block.rows.findIndex((row) => row.id === rowId);
      if (rowIndex >= 0) return { table: block, tableId: block.id, rowIndex };
    }
    if (block.type === "section") {
      const nested = findTableByRow(block.children, rowId);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function findTableByColumn(
  blocks: SupportedDocument["blocks"],
  columnId: string,
): (TableLocation & { readonly columnIndex: number }) | undefined {
  for (const block of blocks) {
    if (block.type === "table") {
      const columnIndex = block.columns.findIndex((column) => column.id === columnId);
      if (columnIndex >= 0) return { table: block, tableId: block.id, columnIndex };
    }
    if (block.type === "section") {
      const nested = findTableByColumn(block.children, columnId);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/** Removes a row and its cells; the last row is schema-guarded (minItems 1). */
/** Adds a row of fresh empty cells; every other row/column/cell ID is kept. */
export function insertTableRow(
  input: ProseMirrorDocument,
  tableId: string,
  allocator: IdAllocator,
  rowIndex?: number,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findTable(document.blocks, tableId);
  rejectMissing(target);
  const index = rowIndex ?? target.table.rows.length;
  if (!Number.isInteger(index) || index < 0 || index > target.table.rows.length) {
    throw new Error("PB02_OPERATION_INVALID");
  }
  const existing = new Set(collectDocumentIds(document));
  const row = {
    id: allocateUnique("row", allocator, existing),
    cells: target.table.columns.map((column) => ({
      id: allocateUnique("cell", allocator, existing),
      columnId: column.id,
      text: "",
    })),
  };
  target.table.rows.splice(index, 0, row);
  return checkedResult(document, [
    tableId,
    row.id,
    ...row.cells.map((cell) => cell.id),
  ]);
}

/** Removes a row and its cells; the last row is schema-guarded (minItems 1). */
export function deleteTableRow(input: ProseMirrorDocument, rowId: string): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findTableByRow(document.blocks, rowId);
  rejectMissing(target);
  if (target.table.rows.length === 1) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  const [row] = target.table.rows.splice(target.rowIndex, 1);
  rejectMissing(row);
  const removed = [row.id, ...row.cells.map((cell) => cell.id)];
  return checkedResult(document, [target.tableId, ...removed], removed);
}

/** Adds a column and one fresh empty cell per row; all other IDs are kept. */
export function insertTableColumn(
  input: ProseMirrorDocument,
  tableId: string,
  header: string,
  align: "start" | "center" | "end",
  allocator: IdAllocator,
  columnIndex?: number,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findTable(document.blocks, tableId);
  rejectMissing(target);
  if (header.length < 1 || header.length > 500) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  const index = columnIndex ?? target.table.columns.length;
  if (!Number.isInteger(index) || index < 0 || index > target.table.columns.length) {
    throw new Error("PB02_OPERATION_INVALID");
  }
  const existing = new Set(collectDocumentIds(document));
  const columnId = allocateUnique("col", allocator, existing);
  target.table.columns.splice(index, 0, { id: columnId, header, align });
  const cellIds: string[] = [];
  for (const row of target.table.rows) {
    const cell = {
      id: allocateUnique("cell", allocator, existing),
      columnId,
      text: "",
    };
    row.cells.splice(index, 0, cell);
    cellIds.push(cell.id);
  }
  return checkedResult(document, [tableId, columnId, ...cellIds]);
}

/** Removes a column and its cell in every row; last column is schema-guarded. */
export function deleteTableColumn(
  input: ProseMirrorDocument,
  columnId: string,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findTableByColumn(document.blocks, columnId);
  rejectMissing(target);
  if (target.table.columns.length === 1) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  target.table.columns.splice(target.columnIndex, 1);
  const removed = [columnId];
  for (const row of target.table.rows) {
    const [cell] = row.cells.splice(target.columnIndex, 1);
    rejectMissing(cell);
    if (cell.columnId !== columnId) throw new Error("PB02_OPERATION_INVALID");
    removed.push(cell.id);
  }
  return checkedResult(document, [target.tableId, ...removed], removed);
}

/**
 * Appends the source list's items to the destination list, preserving every
 * item ID; the now-empty source list node is the only removed identity.
 * Ordered/unordered mismatches fail closed rather than silently converting.
 */
export function mergeLists(
  input: ProseMirrorDocument,
  sourceId: string,
  destinationId: string,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const source = findBlock(document.blocks, sourceId, document.documentId);
  const destination = findBlock(document.blocks, destinationId, document.documentId);
  rejectMissing(source);
  rejectMissing(destination);
  if (
    source.block.type !== "list" ||
    destination.block.type !== "list" ||
    source.block.ordered !== destination.block.ordered
  ) {
    throw new Error("PB02_OPERATION_INVALID");
  }
  if (source.parent.length === 1) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  const movedItems = source.block.items.map((item) => item.id);
  destination.block.items.push(...source.block.items);
  source.parent.splice(source.index, 1);
  return checkedResult(
    document,
    [source.parentId, destinationId, ...movedItems],
    [sourceId],
  );
}

/**
 * Splits a list before the given item: the original list keeps its ID and
 * leading items; the tail items keep their IDs under a fresh sibling list.
 * Splitting before the first item is rejected as a meaningless no-op.
 */
export function splitList(
  input: ProseMirrorDocument,
  listId: string,
  beforeItemId: string,
  allocator: IdAllocator,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findBlock(document.blocks, listId, document.documentId);
  rejectMissing(target);
  if (target.block.type !== "list") throw new Error("PB02_OPERATION_INVALID");
  const itemIndex = target.block.items.findIndex((item) => item.id === beforeItemId);
  if (itemIndex < 0) throw new Error("PB02_OPERATION_TARGET_MISSING");
  if (itemIndex === 0) throw new Error("PB02_OPERATION_INVALID");
  const existing = new Set(collectDocumentIds(document));
  const tailItems = target.block.items.splice(itemIndex);
  const tail = {
    id: allocateUnique("node", allocator, existing),
    type: "list" as const,
    ordered: target.block.ordered,
    items: tailItems,
  };
  target.parent.splice(target.index + 1, 0, tail);
  return checkedResult(document, [
    target.parentId,
    listId,
    tail.id,
    ...tailItems.map((item) => item.id),
  ]);
}

/**
 * A-03 list-item editing (Enter/delete inside a list). Item-level changes
 * alter the descendant ID set, which rewriteBlock rightfully forbids, so
 * they live here with explicit removal accounting. New items always carry
 * caller-provided text: G1-04 BodyText minLength 1 makes empty items
 * contract-invalid, and this layer never invents content.
 */

/** Inserts one item with caller-provided non-empty text at the given index. */
export function insertListItem(
  input: ProseMirrorDocument,
  listId: string,
  itemIndex: number,
  text: string,
  allocator: IdAllocator,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findBlock(document.blocks, listId, document.documentId);
  rejectMissing(target);
  if (target.block.type !== "list") throw new Error("PB02_OPERATION_INVALID");
  if (
    !Number.isInteger(itemIndex) ||
    itemIndex < 0 ||
    itemIndex > target.block.items.length
  ) {
    throw new Error("PB02_OPERATION_INVALID");
  }
  if (text.length < 1 || text.length > 100_000) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  const existing = new Set(collectDocumentIds(document));
  const item = { id: allocateUnique("item", allocator, existing), text };
  target.block.items.splice(itemIndex, 0, item);
  return checkedResult(document, [listId, item.id]);
}

/** Removes one item; the last remaining item is schema-guarded (minItems 1). */
export function deleteListItem(input: ProseMirrorDocument, itemId: string): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const location = findListByItem(document.blocks, itemId);
  rejectMissing(location);
  if (location.list.items.length === 1) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  const [item] = location.list.items.splice(location.itemIndex, 1);
  rejectMissing(item);
  return checkedResult(document, [location.listId, itemId], [itemId]);
}

function findListByItem(
  blocks: SupportedDocument["blocks"],
  itemId: string,
):
  | { readonly list: List; readonly listId: string; readonly itemIndex: number }
  | undefined {
  for (const block of blocks) {
    if (block.type === "list") {
      const itemIndex = block.items.findIndex((item) => item.id === itemId);
      if (itemIndex >= 0) return { list: block, listId: block.id, itemIndex };
    }
    if (block.type === "section") {
      const nested = findListByItem(block.children, itemId);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/**
 * D1 correction: a paragraph misjudged as body text becomes a section whose
 * title is the paragraph text and whose first child IS that paragraph (its ID
 * is preserved; nothing is invented). Title bounds follow G1-04 ShortText.
 */
export function promoteParagraph(
  input: ProseMirrorDocument,
  paragraphId: string,
  level: number,
  allocator: IdAllocator,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findBlock(document.blocks, paragraphId, document.documentId);
  rejectMissing(target);
  if (target.block.type !== "paragraph") throw new Error("PB02_OPERATION_INVALID");
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new Error("PB02_OPERATION_INVALID");
  }
  const title = target.block.text;
  if (title.length > 500) throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  const existing = new Set(collectDocumentIds(document));
  const section = {
    id: allocateUnique("node", allocator, existing),
    type: "section" as const,
    level,
    title,
    children: [target.block],
  };
  target.parent[target.index] = section;
  return checkedResult(document, [target.parentId, section.id, paragraphId]);
}

/**
 * D1 reverse correction: a section is replaced by a fresh paragraph carrying
 * its title, and its children are lifted into the parent with IDs preserved.
 * The section node ID is the only removed identity.
 */
export function demoteSection(
  input: ProseMirrorDocument,
  sectionId: string,
  allocator: IdAllocator,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findBlock(document.blocks, sectionId, document.documentId);
  rejectMissing(target);
  if (target.block.type !== "section") throw new Error("PB02_OPERATION_INVALID");
  const existing = new Set(collectDocumentIds(document));
  const paragraph = {
    id: allocateUnique("node", allocator, existing),
    type: "paragraph" as const,
    text: target.block.title,
  };
  target.parent.splice(target.index, 1, paragraph, ...target.block.children);
  return checkedResult(
    document,
    [target.parentId, paragraph.id, sectionId],
    [sectionId],
  );
}
