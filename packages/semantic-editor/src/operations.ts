import type { Block, SupportedDocument } from "@wenshu/document-model";

import {
  fromProseMirrorDocument,
  toProseMirrorDocument,
  type ProseMirrorDocument,
} from "./adapter.ts";
import { assertDistinctIds, type IdAllocator } from "./ids.ts";

export interface EditResult {
  readonly document: ProseMirrorDocument;
  /** Stable identities whose rendered regions may need refreshing. */
  readonly affectedNodeIds: readonly string[];
}

interface BlockLocation {
  readonly block: Block;
  readonly parent: Block[];
  readonly index: number;
  readonly parentId: string;
}

function cloneDocument(document: SupportedDocument): SupportedDocument {
  return structuredClone(document);
}

function findBlock(
  blocks: Block[],
  id: string,
  parentId: string,
): BlockLocation | undefined {
  for (const [index, block] of blocks.entries()) {
    if (block.id === id) {
      return { block, parent: blocks, index, parentId };
    }
    if (block.type === "section") {
      const nested = findBlock(block.children, id, block.id);
      if (nested !== undefined) {
        return nested;
      }
    }
  }
  return undefined;
}

function findContainer(document: SupportedDocument, id: string): Block[] | undefined {
  if (id === document.documentId) {
    return document.blocks;
  }
  const found = findBlock(document.blocks, id, document.documentId);
  return found?.block.type === "section" ? found.block.children : undefined;
}

function collectIds(block: Block): string[] {
  const ids = [block.id];
  if (block.type === "section") {
    for (const child of block.children) {
      ids.push(...collectIds(child));
    }
  } else if (block.type === "list") {
    ids.push(...block.items.map((item) => item.id));
  } else if (block.type === "table") {
    ids.push(...block.columns.map((column) => column.id));
    for (const row of block.rows) {
      ids.push(row.id, ...row.cells.map((cell) => cell.id));
    }
  }
  return ids;
}

function allocateUnique(
  prefix: "node" | "item" | "col" | "row" | "cell",
  allocator: IdAllocator,
  existing: Set<string>,
): string {
  for (let attempts = 0; attempts < 1_000; attempts += 1) {
    const id = allocator.allocate(prefix);
    if (!existing.has(id)) {
      existing.add(id);
      return id;
    }
  }
  throw new Error("PB02_DUPLICATE_ID");
}

function cloneForInsertion(
  block: Block,
  allocator: IdAllocator,
  existing: Set<string>,
): Block {
  switch (block.type) {
    case "section":
      return {
        ...block,
        id: allocateUnique("node", allocator, existing),
        children: block.children.map((child) =>
          cloneForInsertion(child, allocator, existing),
        ),
      };
    case "list":
      return {
        ...block,
        id: allocateUnique("node", allocator, existing),
        items: block.items.map((item) => ({
          ...item,
          id: allocateUnique("item", allocator, existing),
        })),
      };
    case "table": {
      const columnIds = new Map(
        block.columns.map(
          (column) => [column.id, allocateUnique("col", allocator, existing)] as const,
        ),
      );
      return {
        ...block,
        id: allocateUnique("node", allocator, existing),
        columns: block.columns.map((column) => {
          const id = columnIds.get(column.id);
          if (id === undefined) throw new Error("PB02_OPERATION_INVALID");
          return { ...column, id };
        }),
        rows: block.rows.map((row) => {
          return {
            ...row,
            id: allocateUnique("row", allocator, existing),
            cells: row.cells.map((cell) => {
              const columnId = columnIds.get(cell.columnId);
              if (columnId === undefined) {
                throw new Error("PB02_OPERATION_INVALID");
              }
              return {
                ...cell,
                id: allocateUnique("cell", allocator, existing),
                columnId,
              };
            }),
          };
        }),
      };
    }
    case "figure":
    case "pageBreak":
    case "paragraph":
    case "quote":
    case "toc":
      return { ...block, id: allocateUnique("node", allocator, existing) };
  }
}

function checkedResult(
  document: SupportedDocument,
  affectedNodeIds: readonly string[],
): EditResult {
  const pm = toProseMirrorDocument(document);
  const roundTripped = fromProseMirrorDocument(pm);
  const allIds = collectDocumentIds(roundTripped);
  assertDistinctIds(allIds);
  return Object.freeze({
    document: pm,
    affectedNodeIds: Object.freeze([...affectedNodeIds]),
  });
}

function collectDocumentIds(document: SupportedDocument): string[] {
  return [
    document.documentId,
    ...document.assets.map((asset) => asset.id),
    ...document.blocks.flatMap(collectIds),
  ];
}

function rejectMissing(value: unknown): asserts value {
  if (value === undefined) {
    throw new Error("PB02_OPERATION_TARGET_MISSING");
  }
}

/** Inserts a deep copy, allocating IDs independently of positions or indexes. */
export function insertBlock(
  input: ProseMirrorDocument,
  parentId: string,
  block: Block,
  allocator: IdAllocator,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const parent = findContainer(document, parentId);
  rejectMissing(parent);
  const inserted = cloneForInsertion(
    block,
    allocator,
    new Set(collectDocumentIds(document)),
  );
  parent.push(inserted);
  return checkedResult(document, [parentId, ...collectIds(inserted)]);
}

/** Deletes a block but rejects deletion that would violate G1-04 minItems. */
export function deleteBlock(input: ProseMirrorDocument, id: string): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findBlock(document.blocks, id, document.documentId);
  rejectMissing(target);
  if (target.parent.length === 1) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  target.parent.splice(target.index, 1);
  return checkedResult(document, [target.parentId, id]);
}

/** Moves an existing block without allocating or rewriting any existing ID. */
export function moveBlock(
  input: ProseMirrorDocument,
  id: string,
  destinationParentId: string,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const source = findBlock(document.blocks, id, document.documentId);
  rejectMissing(source);
  if (source.parent.length === 1) {
    throw new Error("PB02_OPERATION_SCHEMA_GUARD");
  }
  if (
    source.block.type === "section" &&
    collectIds(source.block).includes(destinationParentId)
  ) {
    throw new Error("PB02_OPERATION_CYCLE");
  }
  source.parent.splice(source.index, 1);
  const destination = findContainer(document, destinationParentId);
  rejectMissing(destination);
  destination.push(source.block);
  return checkedResult(document, [
    source.parentId,
    destinationParentId,
    ...collectIds(source.block),
  ]);
}

/** Rewrites content while preserving the target's type and every descendant identity. */
export function rewriteBlock(
  input: ProseMirrorDocument,
  id: string,
  rewrite: (block: Block) => Block,
): EditResult {
  const document = cloneDocument(fromProseMirrorDocument(input));
  const target = findBlock(document.blocks, id, document.documentId);
  rejectMissing(target);
  const replacement = rewrite(structuredClone(target.block));
  if (replacement.id !== target.block.id || replacement.type !== target.block.type) {
    throw new Error("PB02_OPERATION_ID_GUARD");
  }
  const previousIds = collectIds(target.block).sort();
  const nextIds = collectIds(replacement).sort();
  if (JSON.stringify(previousIds) !== JSON.stringify(nextIds)) {
    throw new Error("PB02_OPERATION_ID_GUARD");
  }
  target.parent[target.index] = replacement;
  return checkedResult(document, [target.parentId, ...nextIds]);
}

/** Explicit copy is insertion with a deep, fresh identity allocation. */
export function copyBlock(
  input: ProseMirrorDocument,
  id: string,
  destinationParentId: string,
  allocator: IdAllocator,
): EditResult {
  const source = findBlock(fromProseMirrorDocument(input).blocks, id, "root");
  rejectMissing(source);
  return insertBlock(input, destinationParentId, source.block, allocator);
}
