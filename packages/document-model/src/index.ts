import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import documentSchema from "../schema/document.schema.json" with { type: "json" };
import type { Block, Table, WenshuDocument } from "./generated/document.ts";

export type * from "./generated/document.ts";

export const DOCUMENT_SCHEMA_VERSION = "0.1.0" as const;

export type DocumentIssueCode =
  | "DOCUMENT_BUDGET_EXCEEDED"
  | "DOCUMENT_DUPLICATE_ID"
  | "DOCUMENT_REFERENCE_MISSING"
  | "DOCUMENT_SCHEMA"
  | "DOCUMENT_TABLE_COLUMN_MISMATCH";

export interface DocumentIssue {
  readonly code: DocumentIssueCode;
  readonly path: string;
}

export type DocumentValidationResult =
  | {
      readonly ok: true;
      readonly value: WenshuDocument;
    }
  | {
      readonly ok: false;
      readonly issues: readonly DocumentIssue[];
    };

interface IntegrityContext {
  readonly assetIds: ReadonlySet<string>;
  readonly ids: Set<string>;
  readonly issues: DocumentIssue[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<WenshuDocument>(documentSchema);

function addIssue(
  context: IntegrityContext,
  code: DocumentIssueCode,
  path: string,
): void {
  context.issues.push(Object.freeze({ code, path }));
}

function recordId(context: IntegrityContext, id: string, path: string): void {
  if (context.ids.has(id)) {
    addIssue(context, "DOCUMENT_DUPLICATE_ID", path);
    return;
  }
  context.ids.add(id);
}

function validateTable(table: Table, path: string, context: IntegrityContext): void {
  const columnIds = new Set<string>();
  table.columns.forEach((column, columnIndex) => {
    recordId(context, column.id, `${path}/columns/${columnIndex}/id`);
    columnIds.add(column.id);
  });

  table.rows.forEach((row, rowIndex) => {
    const rowPath = `${path}/rows/${rowIndex}`;
    recordId(context, row.id, `${rowPath}/id`);
    const populatedColumns = new Set<string>();
    row.cells.forEach((cell, cellIndex) => {
      const cellPath = `${rowPath}/cells/${cellIndex}`;
      recordId(context, cell.id, `${cellPath}/id`);
      if (!columnIds.has(cell.columnId) || populatedColumns.has(cell.columnId)) {
        addIssue(context, "DOCUMENT_TABLE_COLUMN_MISMATCH", `${cellPath}/columnId`);
      }
      populatedColumns.add(cell.columnId);
    });
    if (populatedColumns.size !== columnIds.size) {
      addIssue(context, "DOCUMENT_TABLE_COLUMN_MISMATCH", `${rowPath}/cells`);
    }
  });
}

function visitBlock(block: Block, path: string, context: IntegrityContext): void {
  recordId(context, block.id, `${path}/id`);
  switch (block.type) {
    case "section":
      block.children.forEach((child, index) => {
        visitBlock(child, `${path}/children/${index}`, context);
      });
      return;
    case "list":
      block.items.forEach((item, index) => {
        recordId(context, item.id, `${path}/items/${index}/id`);
      });
      return;
    case "table":
      validateTable(block, path, context);
      return;
    case "figure":
      if (!context.assetIds.has(block.assetId)) {
        addIssue(context, "DOCUMENT_REFERENCE_MISSING", `${path}/assetId`);
      }
      return;
    case "pageBreak":
    case "paragraph":
    case "quote":
      return;
  }
}

function validateIntegrity(document: WenshuDocument): readonly DocumentIssue[] {
  const assetIds = new Set(document.assets.map((asset) => asset.id));
  const context: IntegrityContext = { assetIds, ids: new Set(), issues: [] };
  recordId(context, document.documentId, "/documentId");
  document.assets.forEach((asset, index) => {
    recordId(context, asset.id, `/assets/${index}/id`);
  });
  document.blocks.forEach((block, index) => {
    visitBlock(block, `/blocks/${index}`, context);
  });
  return Object.freeze(context.issues);
}

export function validateDocument(input: unknown): DocumentValidationResult {
  const inspection = inspectData(input, {
    maxDepth: 64,
    maxNodes: 100_000,
  });
  if (!inspection.ok) {
    const code =
      inspection.kind === "budget" ? "DOCUMENT_BUDGET_EXCEEDED" : "DOCUMENT_SCHEMA";
    return Object.freeze({
      ok: false,
      issues: Object.freeze([Object.freeze({ code, path: inspection.path })]),
    });
  }
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      Object.freeze({
        code: "DOCUMENT_SCHEMA" as const,
        path: error.instancePath || "/",
      }),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }

  const integrityIssues = validateIntegrity(input);
  if (integrityIssues.length > 0) {
    return Object.freeze({ ok: false, issues: integrityIssues });
  }

  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
