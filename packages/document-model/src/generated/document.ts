/* Generated from schema/document.schema.json. Do not edit directly. */

export type DocumentId = string;
export type ShortText = string;
export type Block =
  Section | Paragraph | List | Quote | Table | Figure | PageBreak | Toc;
export type NodeId = string;
export type BodyText = string;
export type ItemId = string;
export type ColumnId = string;
export type RowId = string;
export type CellId = string;
export type AssetId = string;

/**
 * Version 0.2.0 document truth model for the professional report proof of concept (additive over frozen 0.1.0: toc block).
 */
export interface WenshuDocument {
  schemaVersion: "0.2.0";
  documentId: DocumentId;
  revision: number;
  title: ShortText;
  language: string;
  /**
   * @minItems 1
   */
  blocks: Block[];
  assets: Asset[];
}
export interface Section {
  id: NodeId;
  type: "section";
  level: number;
  title: ShortText;
  /**
   * @minItems 1
   */
  children: Block[];
}
export interface Paragraph {
  id: NodeId;
  type: "paragraph";
  text: BodyText;
}
export interface List {
  id: NodeId;
  type: "list";
  ordered: boolean;
  /**
   * @minItems 1
   */
  items: ListItem[];
}
export interface ListItem {
  id: ItemId;
  text: BodyText;
}
export interface Quote {
  id: NodeId;
  type: "quote";
  text: BodyText;
  attribution?: ShortText;
}
export interface Table {
  id: NodeId;
  type: "table";
  caption?: ShortText;
  /**
   * @minItems 1
   */
  columns: TableColumn[];
  /**
   * @minItems 1
   */
  rows: TableRow[];
}
export interface TableColumn {
  id: ColumnId;
  header: ShortText;
  align: "start" | "center" | "end";
}
export interface TableRow {
  id: RowId;
  /**
   * @minItems 1
   */
  cells: TableCell[];
}
export interface TableCell {
  id: CellId;
  columnId: ColumnId;
  text: string;
}
export interface Figure {
  id: NodeId;
  type: "figure";
  assetId: AssetId;
  altText: ShortText;
  caption?: ShortText;
}
export interface PageBreak {
  id: NodeId;
  type: "pageBreak";
  reason: "source" | "section";
}
export interface Toc {
  id: NodeId;
  type: "toc";
}
export interface Asset {
  id: AssetId;
  kind: "image" | "chart";
  path: string;
  mediaType: "image/png" | "image/jpeg" | "image/svg+xml";
  sha256: string;
}
