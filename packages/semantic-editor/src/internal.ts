/** @internal PB-03's only import surface for raw edit primitives. */
export {
  copyBlock,
  deleteBlock,
  insertBlock,
  moveBlock,
  rewriteBlock,
  type EditResult,
} from "./operations.ts";
/** A-03 additive structural primitives (ADR-0030 D1/D3); same /internal boundary. */
export {
  deleteTableColumn,
  deleteTableRow,
  demoteSection,
  insertListItem,
  deleteListItem,
  insertTableColumn,
  insertTableRow,
  mergeLists,
  promoteParagraph,
  splitList,
} from "./structural-operations.ts";
export { fromProseMirrorDocument, type ProseMirrorDocument } from "./adapter.ts";
export type { IdAllocator } from "./ids.ts";
