import {
  validateDocument,
  type Block,
  type SupportedDocument,
} from "@wenshu/document-model";
import {
  RandomIdAllocator,
  fromProseMirrorDocument,
  toProseMirrorDocument,
} from "@wenshu/semantic-editor";
import {
  TransactionManager,
  type EditorCommand,
  type TransactionSession,
} from "@wenshu/editor-transactions";

import type {
  ConfirmationOutcome,
  ImportMeta,
  KeyLike,
  RowModel,
  StructureSummary,
  TableMode,
  WorkspacePhase,
  WorkspaceSnapshot,
} from "./model.ts";
import {
  flattenDocument,
  isTextRow,
  rowIdentity,
  summarizeDocument,
  type Flattened,
} from "./rows.ts";
import { dispatchWorkspaceKey } from "./keys.ts";

/**
 * DOM-free workspace controller (A-03): owns the PB-03 TransactionManager,
 * the flattened row/caret model and every keyboard-reachable action's
 * transaction plumbing. Every mutation goes through manager.execute — there
 * is no other write path in this layer (ADR-0016 #5 / ADR-0030 D1). Key
 * dispatch lives in keys.ts; action bodies in text-actions.ts and
 * structure-actions.ts; this file keeps state + invariants only.
 */
export class WorkspaceController {
  #manager: TransactionManager;
  #flat: Flattened;
  #document: SupportedDocument;
  readonly #summary: StructureSummary;
  readonly importMeta: ImportMeta | undefined;
  #phase: WorkspacePhase;
  #confirmationOutcome: ConfirmationOutcome | undefined;
  #focusRow = 0;
  #offset = 0;
  #tableMode: TableMode | undefined;
  #status = "就绪";
  #undoDepth = 0;
  #redoDepth = 0;
  #queue: Promise<void> = Promise.resolve();

  public constructor(document: SupportedDocument, importMeta?: ImportMeta) {
    const validation = validateDocument(document);
    if (!validation.ok) {
      throw new Error(
        `WORKSPACE_DOCUMENT_INVALID: ${validation.issues[0]?.code ?? "unknown"}`,
      );
    }
    this.#document = validation.value;
    this.#manager = new TransactionManager(
      toProseMirrorDocument(validation.value),
      new RandomIdAllocator(),
    );
    this.#flat = flattenDocument(validation.value);
    this.#summary = summarizeDocument(validation.value);
    this.importMeta = importMeta;
    this.#phase = importMeta === undefined ? "editing" : "confirm";
  }

  public snapshot(): WorkspaceSnapshot {
    return {
      phase: this.#phase,
      title: this.#document.title,
      summary: this.#summary,
      importMeta: this.importMeta,
      confirmationOutcome: this.#confirmationOutcome,
      rows: this.#flat.rows,
      focus: { rowIndex: this.#focusRow, offset: this.#offset, table: this.#tableMode },
      status: this.#status,
      undoDepth: this.#undoDepth,
      redoDepth: this.#redoDepth,
      document: this.#document,
    };
  }

  /** Serializes key handling; resolves true when the key was consumed. */
  public handleKey(key: KeyLike): Promise<boolean> {
    const result = this.#queue.then(() => dispatchWorkspaceKey(this, key));
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  // ---- internal surface for workspace/keys.ts and the two action modules.
  // Not part of the UI contract; mutation still funnels through run().

  public get rows(): readonly RowModel[] {
    return this.#flat.rows;
  }

  public get blocks(): Flattened["blocks"] {
    return this.#flat.blocks;
  }

  public get locations(): Flattened["locations"] {
    return this.#flat.locations;
  }

  public get phase(): WorkspacePhase {
    return this.#phase;
  }

  public get focusRow(): number {
    return this.#focusRow;
  }

  public get offset(): number {
    return this.#offset;
  }

  public get tableMode(): TableMode | undefined {
    return this.#tableMode;
  }

  public setTableMode(mode: TableMode | undefined): void {
    this.#tableMode = mode;
  }

  public setStatus(text: string): void {
    this.#status = text;
  }

  public moveFocus(delta: number): void {
    const next = Math.min(
      Math.max(this.#focusRow + delta, 0),
      this.#flat.rows.length - 1,
    );
    this.#focusRow = next;
    const row = this.#flat.rows[next];
    this.#offset = isTextRow(row) ? Math.min(this.#offset, row.text.length) : 0;
  }

  /** Absolute focus placement (tests/perf samplers; not a keyboard action). */
  public setFocus(rowIndex: number, offset: number): void {
    const clamped = Math.min(Math.max(rowIndex, 0), this.#flat.rows.length - 1);
    this.#focusRow = clamped;
    const row = this.#flat.rows[clamped];
    this.#offset = isTextRow(row) ? Math.min(Math.max(offset, 0), row.text.length) : 0;
    this.#tableMode = undefined;
  }

  public moveCaret(delta: number): boolean {
    const row = this.#flat.rows[this.#focusRow];
    if (!isTextRow(row)) return false;
    const next = this.#offset + delta;
    if (next < 0) {
      if (this.#focusRow === 0) return true;
      this.moveFocus(-1);
      const previous = this.#flat.rows[this.#focusRow];
      this.#offset = isTextRow(previous) ? previous.text.length : 0;
      return true;
    }
    if (next > row.text.length) {
      if (this.#focusRow >= this.#flat.rows.length - 1) return true;
      this.moveFocus(1);
      this.#offset = 0;
      return true;
    }
    this.#offset = next;
    return true;
  }

  public enterWorkspace(outcome: ConfirmationOutcome): void {
    this.#confirmationOutcome = outcome;
    this.#phase = "editing";
    this.#status =
      outcome === "confirmed"
        ? "结构已确认，进入编辑工作区"
        : "已跳过结构确认，进入编辑工作区";
  }

  public containerBlocks(parentId: string): readonly Block[] | undefined {
    if (parentId === this.#document.documentId) return this.#document.blocks;
    const parent = this.#flat.blocks.get(parentId);
    return parent?.type === "section" ? parent.children : undefined;
  }

  /** Sole mutation funnel of this layer: one manager.execute per action. */
  public async run(
    statusText: string,
    build: (session: TransactionSession) => void,
  ): Promise<boolean> {
    const outcome = await this.#manager.execute("human", build);
    if (outcome.status === "committed") {
      this.#refresh(fromProseMirrorDocument(outcome.document));
      this.#undoDepth += 1;
      this.#redoDepth = 0;
      this.#status = `${statusText}（已提交）`;
      return true;
    }
    this.#status = `${statusText}未生效：事务回滚（${outcome.reason}），文档未变`;
    return false;
  }

  public applyCommand(statusText: string, command: EditorCommand): Promise<boolean> {
    return this.run(statusText, (session) => {
      session.apply(command);
    });
  }

  public restoreFocus(identity: string, offset: number): void {
    const index = this.#flat.rows.findIndex((row) => rowIdentity(row) === identity);
    if (index >= 0) {
      this.#focusRow = index;
      const row = this.#flat.rows[index];
      this.#offset = isTextRow(row) ? Math.min(offset, row.text.length) : 0;
      return;
    }
    this.#focusRow = Math.min(this.#focusRow, this.#flat.rows.length - 1);
    this.#offset = 0;
  }

  public clampTableMode(): void {
    const row = this.#flat.rows[this.#focusRow];
    if (this.#tableMode === undefined || row?.kind !== "table") {
      this.#tableMode = undefined;
      return;
    }
    this.#tableMode = {
      row: Math.min(this.#tableMode.row, row.rowIds.length - 1),
      column: Math.min(this.#tableMode.column, row.columnIds.length - 1),
    };
  }

  public undo(): boolean {
    if (this.#undoDepth === 0) {
      this.#status = "没有可撤销的事务";
      return true;
    }
    this.#refresh(fromProseMirrorDocument(this.#manager.undo()));
    this.#undoDepth -= 1;
    this.#redoDepth += 1;
    this.#status = "已撤销";
    return true;
  }

  public redo(): boolean {
    if (this.#redoDepth === 0) {
      this.#status = "没有可重做的事务";
      return true;
    }
    this.#refresh(fromProseMirrorDocument(this.#manager.redo()));
    this.#undoDepth += 1;
    this.#redoDepth -= 1;
    this.#status = "已重做";
    return true;
  }

  #refresh(document: SupportedDocument): void {
    this.#document = document;
    this.#flat = flattenDocument(document);
  }
}
