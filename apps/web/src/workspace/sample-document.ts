import type { WenshuDocument } from "@wenshu/document-model";

import type { ImportMeta } from "./model.ts";

const hex = (seed: string): string => seed.padEnd(32, "0").slice(0, 32);

/** 开发/联调用小型样例文档（合法契约形态：节 children minItems 1、块 minItems 1）。 */
export function buildSampleDocument(): WenshuDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: `doc_${hex("d0c0")}`,
    revision: 1,
    title: "样例报告",
    language: "zh-CN",
    assets: [],
    blocks: [
      {
        id: `node_${hex("5ec7")}`,
        type: "section",
        level: 1,
        title: "一、概述",
        children: [
          {
            id: `node_${hex("9a1a")}`,
            type: "paragraph",
            text: "这是第一段，Enter 可拆分。",
          },
          {
            id: `node_${hex("9a2a")}`,
            type: "paragraph",
            text: "这是第二段，段首退格可并入上一段。",
          },
        ],
      },
      {
        id: `node_${hex("1157")}`,
        type: "list",
        ordered: false,
        items: [
          { id: `item_${hex("17e1")}`, text: "列表项甲" },
          { id: `item_${hex("17e2")}`, text: "列表项乙" },
        ],
      },
      {
        id: `node_${hex("7ab1")}`,
        type: "table",
        columns: [
          { id: `col_${hex("c011")}`, header: "指标", align: "start" },
          { id: `col_${hex("c012")}`, header: "数值", align: "end" },
        ],
        rows: [
          {
            id: `row_${hex("a011")}`,
            cells: [
              { id: `cell_${hex("ce11")}`, columnId: `col_${hex("c011")}`, text: "甲" },
              { id: `cell_${hex("ce12")}`, columnId: `col_${hex("c012")}`, text: "1" },
            ],
          },
        ],
      },
    ],
  };
}

/** 样例导入终态元数据：驱动 D1 结构确认视图（含一项被降级资源）。 */
export function buildSampleImportMeta(): ImportMeta {
  return Object.freeze({
    status: "partial",
    materialName: "0123456789abcdef.md",
    importedAssets: Object.freeze(["0123456789abcdef.png"]),
    failedAssets: Object.freeze([
      Object.freeze({ fileName: "missing-chart.svg", reasonCode: "asset_missing" }),
    ]),
  });
}
