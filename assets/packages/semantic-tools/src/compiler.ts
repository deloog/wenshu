import type { Block, SupportedDocument } from "@wenshu/document-model";
import type { EditorCommand, TransactionManager } from "@wenshu/editor-transactions";
import { fromProseMirrorDocument } from "@wenshu/semantic-editor";

import {
  isAllowed,
  modelToolDefinitions,
  type ModelToolResult,
  type ToolPermission,
  type ToolRejectionCode,
  type ToolRequest,
} from "./contract.ts";
import { decodeToolRequest } from "./decode.ts";

function findBlock(blocks: readonly Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.type === "section") {
      const nested = findBlock(block.children, id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function temporaryId(prefix: "node" | "col" | "row" | "cell", ordinal: number): string {
  return `${prefix}_${ordinal.toString(16).padStart(32, "0")}`;
}

function documentFor(manager: TransactionManager): SupportedDocument {
  return fromProseMirrorDocument(manager.snapshot());
}

function isContainer(document: SupportedDocument, id: string): boolean {
  if (id === document.documentId) return true;
  return findBlock(document.blocks, id)?.type === "section";
}

function compile(
  request: ToolRequest,
  document: SupportedDocument,
): EditorCommand | ToolRejectionCode {
  switch (request.tool) {
    case "rewrite": {
      const target = findBlock(document.blocks, request.nodeId);
      if (target === undefined) return "TOOL_TARGET_INVALID";
      if (target.type === "paragraph" || target.type === "quote") {
        return {
          kind: "rewrite",
          id: target.id,
          replacement: { ...target, text: request.text },
        };
      }
      return "TOOL_TARGET_KIND_REJECTED";
    }
    case "insert":
      if (!isContainer(document, request.parentId)) return "TOOL_TARGET_INVALID";
      return {
        kind: "insert",
        parentId: request.parentId,
        block: { id: temporaryId("node", 1), type: "paragraph", text: request.text },
      };
    case "outline":
      if (!isContainer(document, request.parentId)) return "TOOL_TARGET_INVALID";
      return {
        kind: "insert",
        parentId: request.parentId,
        block: {
          id: temporaryId("node", 1),
          type: "section",
          level: request.level,
          title: request.title,
          children: [
            {
              id: temporaryId("node", 2),
              type: "paragraph",
              text: request.initialText,
            },
          ],
        },
      };
    case "table": {
      if (!isContainer(document, request.parentId)) return "TOOL_TARGET_INVALID";
      const columns = request.columns.map((column, index) => ({
        id: temporaryId("col", index + 1),
        header: column.header,
        align: column.align,
      }));
      return {
        kind: "insert",
        parentId: request.parentId,
        block: {
          id: temporaryId("node", 1),
          type: "table",
          ...(request.caption === undefined ? {} : { caption: request.caption }),
          columns,
          rows: request.rows.map((cells, rowIndex) => ({
            id: temporaryId("row", rowIndex + 1),
            cells: cells.map((text, columnIndex) => ({
              id: temporaryId("cell", rowIndex * columns.length + columnIndex + 1),
              columnId: columns[columnIndex]?.id ?? "",
              text,
            })),
          })),
        },
      };
    }
    case "citation":
      if (!isContainer(document, request.parentId)) return "TOOL_TARGET_INVALID";
      return {
        kind: "insert",
        parentId: request.parentId,
        block: {
          id: temporaryId("node", 1),
          type: "quote",
          text: request.text,
          attribution: request.attribution,
        },
      };
    case "move_subtree":
      if (
        findBlock(document.blocks, request.nodeId) === undefined ||
        !isContainer(document, request.destinationParentId)
      ) {
        return "TOOL_TARGET_INVALID";
      }
      return {
        kind: "move",
        id: request.nodeId,
        destinationParentId: request.destinationParentId,
      };
  }
}

/**
 * The object passed to a model. It keeps the manager and raw command compiler
 * in private fields and returns only six frozen semantic tool definitions.
 */
export class ModelToolGateway {
  #manager: TransactionManager;
  #permission: ToolPermission;

  public constructor(manager: TransactionManager, permission: ToolPermission) {
    this.#manager = manager;
    this.#permission = Object.freeze({
      allowedTools: Object.freeze([...permission.allowedTools]),
      writableNodeIds: Object.freeze([...permission.writableNodeIds]),
    });
  }

  public tools() {
    return modelToolDefinitions();
  }

  public async invoke(untrusted: unknown): Promise<ModelToolResult> {
    const decoded = decodeToolRequest(untrusted);
    if (typeof decoded === "string")
      return Object.freeze({ status: "rejected", code: decoded });
    if (!isAllowed(this.#permission, decoded)) {
      return Object.freeze({ status: "rejected", code: "TOOL_PERMISSION_DENIED" });
    }
    const command = compile(decoded, documentFor(this.#manager));
    if (typeof command === "string")
      return Object.freeze({ status: "rejected", code: command });
    const outcome = await this.#manager.execute("ai", (session) =>
      session.apply(command),
    );
    if (outcome.status !== "committed") {
      return Object.freeze({
        status: "rejected",
        code: "TOOL_TRANSACTION_ROLLED_BACK",
      });
    }
    return Object.freeze({
      status: "committed",
      affectedNodeIds: Object.freeze([...outcome.affectedNodeIds]),
    });
  }
}
