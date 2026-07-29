import { Schema, type NodeSpec } from "prosemirror-model";

const atomBlock: NodeSpec = { atom: true, group: "block" };

/**
 * ProseMirror is the in-memory editing representation only. All user-visible
 * semantics remain G1-04 objects and are checked on every adapter boundary.
 */
export const semanticEditorSchema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      attrs: {
        schemaVersion: {},
        documentId: {},
        revision: {},
        title: {},
        language: {},
        assets: {},
      },
    },
    section: {
      group: "block",
      content: "block+",
      attrs: { id: {}, level: {}, title: {} },
    },
    paragraph: {
      ...atomBlock,
      attrs: { id: { default: "" }, text: { default: "" } },
    },
    list: {
      group: "block",
      content: "listItem+",
      attrs: { id: {}, ordered: {} },
    },
    listItem: { atom: true, attrs: { id: { default: "" }, text: { default: "" } } },
    quote: { ...atomBlock, attrs: { id: {}, text: {}, attribution: {} } },
    table: {
      group: "block",
      content: "tableColumn+ tableRow+",
      attrs: { id: {}, caption: {} },
    },
    tableColumn: {
      attrs: {
        id: { default: "" },
        header: { default: "" },
        align: { default: "start" },
      },
    },
    tableRow: { content: "tableCell+", attrs: { id: { default: "" } } },
    tableCell: {
      attrs: { id: { default: "" }, columnId: { default: "" }, text: { default: "" } },
    },
    figure: {
      ...atomBlock,
      attrs: { id: {}, assetId: {}, altText: {}, caption: {} },
    },
    pageBreak: { ...atomBlock, attrs: { id: {}, reason: {} } },
    toc: { ...atomBlock, attrs: { id: {} } },
    text: { group: "inline" },
  },
  marks: {},
});
