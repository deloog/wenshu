import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import documentSchema from "../schema/document.schema.json" with { type: "json" };
import documentSchemaV0_1_0 from "../schema/document-0.1.0.schema.json" with { type: "json" };
import type { Block, Table, WenshuDocument } from "./generated/document.ts";
import type { WenshuDocumentV0_1_0 } from "./generated/document-0.1.0.ts";

export type * from "./generated/document.ts";
export type { WenshuDocumentV0_1_0 } from "./generated/document-0.1.0.ts";
export { TOC_HEADING, collectTocEntries } from "./toc.ts";
export type { TocEntry } from "./toc.ts";

/** 当前生产器版本；读取方同时接受冻结的 0.1.0（additive 升级纪律，ADR-0010）。 */
export const DOCUMENT_SCHEMA_VERSION = "0.2.0" as const;
export const SUPPORTED_DOCUMENT_SCHEMA_VERSIONS = Object.freeze([
  "0.1.0",
  "0.2.0",
] as const);

/** 读取方接受的支持版本文档：0.2.0（含 toc 块）或冻结 0.1.0。 */
export type SupportedDocument = WenshuDocument | WenshuDocumentV0_1_0;

type SupportedBlock = Block | WenshuDocumentV0_1_0["blocks"][number];
type SupportedTable = Table | Extract<SupportedBlock, { type: "table" }>;

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
      readonly value: SupportedDocument;
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
const validateShapeV0_1_0 = ajv.compile<WenshuDocumentV0_1_0>(documentSchemaV0_1_0);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function validateTable(
  table: SupportedTable,
  path: string,
  context: IntegrityContext,
): void {
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

function visitBlock(block: SupportedBlock, path: string, context: IntegrityContext): void {
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
    case "toc":
      return;
  }
}

function validateIntegrity(document: SupportedDocument): readonly DocumentIssue[] {
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

function schemaIssues(
  errors: { readonly instancePath: string }[] | null | undefined,
): readonly DocumentIssue[] {
  return Object.freeze(
    (errors ?? []).map((error) =>
      Object.freeze({
        code: "DOCUMENT_SCHEMA" as const,
        path: error.instancePath || "/",
      }),
    ),
  );
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

  // 版本分发：冻结 0.1.0 走冻结 schema；其余（含未来版本）由当前 schema 的
  // const 精确拒绝，禁止“尽力读取”后静默丢字段（document-model §4）。
  const version = isRecord(input) ? input["schemaVersion"] : undefined;
  if (version === "0.1.0") {
    if (!validateShapeV0_1_0(input)) {
      return Object.freeze({
        ok: false,
        issues: schemaIssues(validateShapeV0_1_0.errors),
      });
    }
    const integrityIssues = validateIntegrity(input);
    if (integrityIssues.length > 0) {
      return Object.freeze({ ok: false, issues: integrityIssues });
    }
    return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
  }

  if (!validateShape(input)) {
    return Object.freeze({ ok: false, issues: schemaIssues(validateShape.errors) });
  }

  const integrityIssues = validateIntegrity(input);
  if (integrityIssues.length > 0) {
    return Object.freeze({ ok: false, issues: integrityIssues });
  }

  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
