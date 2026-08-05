import type { Block, SupportedDocument } from "@wenshu/document-model";
import {
  copyBlock,
  deleteBlock,
  deleteTableColumn,
  deleteTableRow,
  demoteSection,
  deleteListItem,
  insertListItem,
  fromProseMirrorDocument,
  insertBlock,
  insertTableColumn,
  insertTableRow,
  mergeLists,
  moveBlock,
  promoteParagraph,
  rewriteBlock,
  splitList,
  type IdAllocator,
  type ProseMirrorDocument,
} from "@wenshu/semantic-editor/internal";

import type { EditorActor, EditorCommand } from "./commands.ts";

export type { EditorActor, EditorCommand } from "./commands.ts";

export type TransactionOutcome =
  | {
      readonly status: "committed";
      readonly actor: EditorActor;
      readonly document: ProseMirrorDocument;
      readonly affectedNodeIds: readonly string[];
    }
  | {
      readonly status: "rolled_back";
      readonly actor: EditorActor;
      readonly reason: "cancelled" | "operation_failed" | "validation_failed";
      readonly document: ProseMirrorDocument;
      readonly affectedNodeIds: readonly string[];
    };

interface HistoryEntry {
  readonly before: ProseMirrorDocument;
  readonly after: ProseMirrorDocument;
  readonly affectedNodeIds: readonly string[];
}

const TRANSACTION_CAPABILITY = Symbol("PB03 transaction manager capability");

function collectBlockIds(block: Block): string[] {
  const ids = [block.id];
  if (block.type === "section") {
    block.children.forEach((child) => ids.push(...collectBlockIds(child)));
  } else if (block.type === "list") {
    block.items.forEach((item) => ids.push(item.id));
  } else if (block.type === "table") {
    block.columns.forEach((column) => ids.push(column.id));
    block.rows.forEach((row) => {
      ids.push(row.id);
      row.cells.forEach((cell) => ids.push(cell.id));
    });
  }
  return ids;
}

function collectDocumentIds(document: SupportedDocument): Set<string> {
  return new Set([
    document.documentId,
    ...document.assets.map((asset) => asset.id),
    ...document.blocks.flatMap(collectBlockIds),
  ]);
}

function findBlockIds(
  blocks: readonly Block[],
  id: string,
): readonly string[] | undefined {
  for (const block of blocks) {
    if (block.id === id) return collectBlockIds(block);
    if (block.type === "section") {
      const nested = findBlockIds(block.children, id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function ensureStableIds(
  previous: ProseMirrorDocument,
  next: ProseMirrorDocument,
  permittedDeletion: ReadonlySet<string>,
): void {
  const beforeIds = collectDocumentIds(fromProseMirrorDocument(previous));
  const afterIds = collectDocumentIds(fromProseMirrorDocument(next));
  for (const id of beforeIds) {
    if (!permittedDeletion.has(id) && !afterIds.has(id)) {
      throw new Error("PB03_STABLE_ID_GUARD");
    }
  }
}

export class TransactionSession {
  #document: ProseMirrorDocument;
  #outcome: TransactionOutcome | undefined;
  #affected = new Set<string>();
  #permittedDeletion = new Set<string>();
  readonly actor: EditorActor;
  readonly before: ProseMirrorDocument;
  private readonly allocator: IdAllocator;

  public constructor(
    actor: EditorActor,
    before: ProseMirrorDocument,
    allocator: IdAllocator,
  ) {
    this.actor = actor;
    this.before = before;
    this.allocator = allocator;
    // Adapter validation occurs before a session is ever exposed.
    fromProseMirrorDocument(before);
    this.#document = before;
  }

  public get open(): boolean {
    return this.#outcome === undefined;
  }

  public get outcome(): TransactionOutcome | undefined {
    return this.#outcome;
  }

  public apply(command: EditorCommand): void {
    if (!this.open) throw new Error("PB03_TRANSACTION_TERMINAL");
    const beforeCommand = this.#document;
    try {
      if (command.kind === "delete") {
        const targetIds = findBlockIds(
          fromProseMirrorDocument(beforeCommand).blocks,
          command.id,
        );
        if (targetIds === undefined) throw new Error("PB03_TRANSACTION_TARGET_MISSING");
        targetIds.forEach((id) => this.#permittedDeletion.add(id));
      }
      const result = this.applyCommand(command);
      result.removedNodeIds.forEach((id) => this.#permittedDeletion.add(id));
      ensureStableIds(beforeCommand, result.document, this.#permittedDeletion);
      this.#document = result.document;
      result.affectedNodeIds.forEach((id) => this.#affected.add(id));
    } catch (error) {
      this.#rollback("operation_failed");
      throw error;
    }
  }

  public commit(capability: symbol): TransactionOutcome {
    this.assertCapability(capability);
    if (this.#outcome !== undefined) return this.#outcome;
    try {
      // Re-run the PB-02 adapter validator at the only visible write boundary.
      fromProseMirrorDocument(this.#document);
      this.#outcome = Object.freeze({
        status: "committed",
        actor: this.actor,
        document: this.#document,
        affectedNodeIds: Object.freeze([...this.#affected].sort()),
      });
      return this.#outcome;
    } catch {
      return this.#rollback("validation_failed");
    }
  }

  public rollback(
    reason: "cancelled" | "operation_failed" | "validation_failed",
    capability: symbol,
  ): TransactionOutcome {
    this.assertCapability(capability);
    return this.#rollback(reason);
  }

  #rollback(
    reason: "cancelled" | "operation_failed" | "validation_failed",
  ): TransactionOutcome {
    if (this.#outcome !== undefined) return this.#outcome;
    this.#outcome = Object.freeze({
      status: "rolled_back",
      actor: this.actor,
      reason,
      document: this.before,
      affectedNodeIds: Object.freeze([]),
    });
    return this.#outcome;
  }

  private assertCapability(capability: symbol): void {
    if (capability !== TRANSACTION_CAPABILITY) {
      throw new Error("PB03_TRANSACTION_MANAGER_REQUIRED");
    }
  }

  private applyCommand(command: EditorCommand) {
    switch (command.kind) {
      case "insert":
        return insertBlock(
          this.#document,
          command.parentId,
          command.block,
          this.allocator,
        );
      case "delete":
        return deleteBlock(this.#document, command.id);
      case "move":
        return moveBlock(
          this.#document,
          command.id,
          command.destinationParentId,
          command.destinationIndex,
        );
      case "rewrite":
        return rewriteBlock(this.#document, command.id, () => command.replacement);
      case "copy":
        return copyBlock(
          this.#document,
          command.id,
          command.destinationParentId,
          this.allocator,
        );
      case "insert-table-row":
        return insertTableRow(
          this.#document,
          command.tableId,
          this.allocator,
          command.rowIndex,
        );
      case "delete-table-row":
        return deleteTableRow(this.#document, command.rowId);
      case "insert-table-column":
        return insertTableColumn(
          this.#document,
          command.tableId,
          command.header,
          command.align,
          this.allocator,
          command.columnIndex,
        );
      case "delete-table-column":
        return deleteTableColumn(this.#document, command.columnId);
      case "merge-lists":
        return mergeLists(this.#document, command.sourceId, command.destinationId);
      case "split-list":
        return splitList(
          this.#document,
          command.listId,
          command.beforeItemId,
          this.allocator,
        );
      case "promote-paragraph":
        return promoteParagraph(
          this.#document,
          command.paragraphId,
          command.level,
          this.allocator,
        );
      case "demote-section":
        return demoteSection(this.#document, command.sectionId, this.allocator);
      case "insert-list-item":
        return insertListItem(
          this.#document,
          command.listId,
          command.itemIndex,
          command.text,
          this.allocator,
        );
      case "delete-list-item":
        return deleteListItem(this.#document, command.itemId);
    }
  }
}

/** The sole public document write boundary for human and AI edit commands. */
export class TransactionManager {
  #document: ProseMirrorDocument;
  #active: TransactionSession | undefined;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  private readonly allocator: IdAllocator;

  public constructor(initialDocument: ProseMirrorDocument, allocator: IdAllocator) {
    this.allocator = allocator;
    fromProseMirrorDocument(initialDocument);
    this.#document = initialDocument;
  }

  public snapshot(): ProseMirrorDocument {
    return this.#document;
  }

  public begin(actor: EditorActor): TransactionSession {
    if (this.#active !== undefined) throw new Error("PB03_TRANSACTION_ACTIVE");
    const session = new TransactionSession(actor, this.#document, this.allocator);
    this.#active = session;
    return session;
  }

  public commit(session: TransactionSession): TransactionOutcome {
    this.assertActive(session);
    const outcome = session.commit(TRANSACTION_CAPABILITY);
    this.#active = undefined;
    if (outcome.status === "committed") {
      this.#undo.push({
        before: session.before,
        after: outcome.document,
        affectedNodeIds: outcome.affectedNodeIds,
      });
      this.#redo = [];
      this.#document = outcome.document;
    }
    return outcome;
  }

  public rollback(session: TransactionSession): TransactionOutcome {
    this.assertActive(session);
    const outcome = session.rollback("operation_failed", TRANSACTION_CAPABILITY);
    this.#active = undefined;
    return outcome;
  }

  public cancel(session: TransactionSession): TransactionOutcome {
    if (this.#active !== session && session.outcome !== undefined) {
      return session.outcome;
    }
    this.assertActive(session);
    const outcome = session.rollback("cancelled", TRANSACTION_CAPABILITY);
    this.#active = undefined;
    return outcome;
  }

  public async execute(
    actor: EditorActor,
    run: (session: TransactionSession) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<TransactionOutcome> {
    const session = this.begin(actor);
    const onAbort = (): void => {
      if (this.#active === session && session.open) this.cancel(session);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal?.aborted) return this.cancel(session);
      await run(session);
      if (session.outcome !== undefined) {
        if (this.#active === session) this.#active = undefined;
        return session.outcome;
      }
      if (signal?.aborted) return this.cancel(session);
      return this.commit(session);
    } catch {
      if (session.outcome !== undefined) {
        if (this.#active === session) this.#active = undefined;
        return session.outcome;
      }
      return this.rollback(session);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  public undo(): ProseMirrorDocument {
    if (this.#active !== undefined) throw new Error("PB03_TRANSACTION_ACTIVE");
    const entry = this.#undo.pop();
    if (entry === undefined) return this.#document;
    this.#redo.push(entry);
    this.#document = entry.before;
    return this.#document;
  }

  public redo(): ProseMirrorDocument {
    if (this.#active !== undefined) throw new Error("PB03_TRANSACTION_ACTIVE");
    const entry = this.#redo.pop();
    if (entry === undefined) return this.#document;
    this.#undo.push(entry);
    this.#document = entry.after;
    return this.#document;
  }

  private assertActive(session: TransactionSession): void {
    if (this.#active !== session) throw new Error("PB03_TRANSACTION_NOT_ACTIVE");
  }
}
