/** @internal PB-03's only import surface for raw edit primitives. */
export {
  copyBlock,
  deleteBlock,
  insertBlock,
  moveBlock,
  rewriteBlock,
  type EditResult,
} from "./operations.ts";
export { fromProseMirrorDocument, type ProseMirrorDocument } from "./adapter.ts";
export type { IdAllocator } from "./ids.ts";
