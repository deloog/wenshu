import {
  validateDocument,
  type Asset,
  type Block,
  type ListItem,
  type SupportedDocument,
  type TableCell,
  type TableColumn,
  type TableRow,
} from "@wenshu/document-model";
import { type Node as ProseMirrorNode } from "prosemirror-model";

import { semanticEditorSchema } from "./schema.ts";

export type ProseMirrorDocument = ProseMirrorNode;

interface Attributes {
  readonly schemaVersion?: unknown;
  readonly documentId?: unknown;
  readonly revision?: unknown;
  readonly title?: unknown;
  readonly language?: unknown;
  readonly assets?: unknown;
  readonly id?: unknown;
  readonly level?: unknown;
  readonly text?: unknown;
  readonly ordered?: unknown;
  readonly attribution?: unknown;
  readonly caption?: unknown;
  readonly header?: unknown;
  readonly align?: unknown;
  readonly columnId?: unknown;
  readonly assetId?: unknown;
  readonly altText?: unknown;
  readonly reason?: unknown;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  return value;
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  return value;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  return value;
}

function attrs(node: ProseMirrorNode): Attributes {
  return node.attrs as Attributes;
}

function assetList(value: unknown): Asset[] {
  if (!Array.isArray(value)) {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  return value.map((asset) => ({ ...(asset as Asset) }));
}

function pmBlock(block: Block): ProseMirrorNode {
  switch (block.type) {
    case "section":
      return semanticEditorSchema.nodes.section.createChecked(
        { id: block.id, level: block.level, title: block.title },
        block.children.map(pmBlock),
      );
    case "paragraph":
      return semanticEditorSchema.nodes.paragraph.createChecked({
        id: block.id,
        text: block.text,
      });
    case "list":
      return semanticEditorSchema.nodes.list.createChecked(
        { id: block.id, ordered: block.ordered },
        block.items.map((item) =>
          semanticEditorSchema.nodes.listItem.createChecked({
            id: item.id,
            text: item.text,
          }),
        ),
      );
    case "quote":
      return semanticEditorSchema.nodes.quote.createChecked({
        id: block.id,
        text: block.text,
        attribution: block.attribution ?? null,
      });
    case "table":
      return semanticEditorSchema.nodes.table.createChecked(
        { id: block.id, caption: block.caption ?? null },
        [
          ...block.columns.map((column) =>
            semanticEditorSchema.nodes.tableColumn.createChecked(column),
          ),
          ...block.rows.map((row) =>
            semanticEditorSchema.nodes.tableRow.createChecked(
              { id: row.id },
              row.cells.map((cell) =>
                semanticEditorSchema.nodes.tableCell.createChecked(cell),
              ),
            ),
          ),
        ],
      );
    case "figure":
      return semanticEditorSchema.nodes.figure.createChecked({
        id: block.id,
        assetId: block.assetId,
        altText: block.altText,
        caption: block.caption ?? null,
      });
    case "pageBreak":
      return semanticEditorSchema.nodes.pageBreak.createChecked({
        id: block.id,
        reason: block.reason,
      });
    case "toc":
      return semanticEditorSchema.nodes.toc.createChecked({ id: block.id });
  }
}

function fromListItem(node: ProseMirrorNode): ListItem {
  const value = attrs(node);
  return { id: requiredString(value.id), text: requiredString(value.text) };
}

function fromTableColumn(node: ProseMirrorNode): TableColumn {
  const value = attrs(node);
  const align = requiredString(value.align);
  if (align !== "start" && align !== "center" && align !== "end") {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  return { id: requiredString(value.id), header: requiredString(value.header), align };
}

function fromTableCell(node: ProseMirrorNode): TableCell {
  const value = attrs(node);
  return {
    id: requiredString(value.id),
    columnId: requiredString(value.columnId),
    text: requiredString(value.text),
  };
}

function fromTableRow(node: ProseMirrorNode): TableRow {
  return {
    id: requiredString(attrs(node).id),
    cells: node.content.content.map(fromTableCell),
  };
}

function fromBlock(node: ProseMirrorNode): Block {
  const value = attrs(node);
  switch (node.type.name) {
    case "section":
      return {
        id: requiredString(value.id),
        type: "section",
        level: requiredNumber(value.level),
        title: requiredString(value.title),
        children: node.content.content.map(fromBlock),
      };
    case "paragraph":
      return {
        id: requiredString(value.id),
        type: "paragraph",
        text: requiredString(value.text),
      };
    case "list":
      return {
        id: requiredString(value.id),
        type: "list",
        ordered: requiredBoolean(value.ordered),
        items: node.content.content.map(fromListItem),
      };
    case "quote": {
      const attribution = optionalString(value.attribution);
      return {
        id: requiredString(value.id),
        type: "quote",
        text: requiredString(value.text),
        ...(attribution === undefined ? {} : { attribution }),
      };
    }
    case "table": {
      const columns: TableColumn[] = [];
      const rows: TableRow[] = [];
      for (const child of node.content.content) {
        if (child.type.name === "tableColumn") {
          columns.push(fromTableColumn(child));
        } else if (child.type.name === "tableRow") {
          rows.push(fromTableRow(child));
        } else {
          throw new Error("PB02_ADAPTER_INVALID");
        }
      }
      const caption = optionalString(value.caption);
      return {
        id: requiredString(value.id),
        type: "table",
        ...(caption === undefined ? {} : { caption }),
        columns,
        rows,
      };
    }
    case "figure": {
      const caption = optionalString(value.caption);
      return {
        id: requiredString(value.id),
        type: "figure",
        assetId: requiredString(value.assetId),
        altText: requiredString(value.altText),
        ...(caption === undefined ? {} : { caption }),
      };
    }
    case "pageBreak": {
      const reason = requiredString(value.reason);
      if (reason !== "source" && reason !== "section") {
        throw new Error("PB02_ADAPTER_INVALID");
      }
      return { id: requiredString(value.id), type: "pageBreak", reason };
    }
    case "toc":
      return { id: requiredString(value.id), type: "toc" };
    default:
      throw new Error("PB02_ADAPTER_INVALID");
  }
}

/** Converts every G1-04 block/attribute/ID to the ProseMirror representation. */
export function toProseMirrorDocument(
  document: SupportedDocument,
): ProseMirrorDocument {
  const checked = validateDocument(document);
  if (!checked.ok) {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  return semanticEditorSchema.nodes.doc.createChecked(
    {
      schemaVersion: checked.value.schemaVersion,
      documentId: checked.value.documentId,
      revision: checked.value.revision,
      title: checked.value.title,
      language: checked.value.language,
      assets: checked.value.assets.map((asset) => ({ ...asset })),
    },
    checked.value.blocks.map(pmBlock),
  );
}

/** Converts back through the frozen validator; malformed PM documents fail closed. */
export function fromProseMirrorDocument(
  document: ProseMirrorDocument,
): SupportedDocument {
  if (document.type.name !== "doc") {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  const value = attrs(document);
  const candidate: unknown = {
    schemaVersion: requiredString(value.schemaVersion),
    documentId: requiredString(value.documentId),
    revision: requiredNumber(value.revision),
    title: requiredString(value.title),
    language: requiredString(value.language),
    assets: assetList(value.assets),
    blocks: document.content.content.map(fromBlock),
  };
  const checked = validateDocument(candidate);
  if (!checked.ok) {
    throw new Error("PB02_ADAPTER_INVALID");
  }
  return checked.value;
}
