import { createHash } from "node:crypto";

import type { WenshuDocument } from "@wenshu/document-model";

import { MarkdownImportError } from "./errors.ts";
import type { ParsedSource } from "./parser.ts";

export interface ResolvedFigure {
  readonly source: string;
  readonly alt: string;
  readonly assetId: string;
}

export interface ResolvedAsset {
  readonly id: string;
  readonly kind: string;
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: string;
}

type JsonObject = Record<string, unknown>;

interface SectionFrame {
  readonly level: number;
  readonly node: JsonObject;
  readonly children: JsonObject[];
}

function stableId(prefix: string, seed: string, kind: string, digest: string): string {
  // 决策 #8 承重不变量：kind 必须取自非数字词汇表，种子前缀才能与内容无歧义分界。
  if (!/^[A-Za-z-]+$/u.test(kind)) {
    throw new Error(`stableId kind must be non-numeric vocabulary: ${kind}`);
  }
  const hash = createHash("sha256")
    .update(`${seed}:${kind}:${digest}`)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}_${hash}`;
}

export function assembleDocument(
  parsed: ParsedSource,
  figures: readonly ResolvedFigure[],
  assets: readonly ResolvedAsset[],
  documentNamespace: string,
): WenshuDocument {
  const title = parsed.metadata["title"];
  if (typeof title !== "string" || title.length === 0) {
    throw new MarkdownImportError(
      "IMPORT_FRONTMATTER_INVALID",
      "front matter must provide a non-empty title",
    );
  }
  // 决策 #9：documentId 是跨修订稳定标识，派生自公共导入根相对路径 + 标题。
  const documentId = `doc_${createHash("sha256")
    .update(`wenshu/import/v0\n${documentNamespace}\n${title}`)
    .digest("hex")
    .slice(0, 32)}`;
  let ordinal = 0;
  const figureQueue = [...figures];
  const roots: JsonObject[] = [];
  const stack: SectionFrame[] = [];

  const closeSection = (): void => {
    const frame = stack.pop();
    if (frame === undefined) {
      return;
    }
    if (frame.children.length === 0) {
      throw new MarkdownImportError(
        "IMPORT_UNSUPPORTED_SYNTAX",
        "section must contain at least one block",
      );
    }
    frame.node["children"] = frame.children;
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(frame.node);
    } else {
      parent.children.push(frame.node);
    }
  };

  const appendBlock = (block: JsonObject): void => {
    const top = stack[stack.length - 1];
    if (top === undefined) {
      roots.push(block);
    } else {
      top.children.push(block);
    }
  };

  for (const block of parsed.blocks) {
    ordinal += 1;
    switch (block.kind) {
      case "heading": {
        while (
          stack.length > 0 &&
          (stack[stack.length - 1]?.level ?? 0) >= block.level
        ) {
          closeSection();
        }
        stack.push({
          level: block.level,
          node: {
            id: stableId(
              "node",
              `${ordinal}`,
              "section",
              `${block.level}:${block.text}`,
            ),
            type: "section",
            level: block.level,
            title: block.text,
          },
          children: [],
        });
        break;
      }
      case "paragraph":
        appendBlock({
          id: stableId("node", `${ordinal}`, "paragraph", block.text),
          type: "paragraph",
          text: block.text,
        });
        break;
      case "quote":
        appendBlock({
          id: stableId("node", `${ordinal}`, "quote", block.text),
          type: "quote",
          text: block.text,
        });
        break;
      case "list":
        appendBlock({
          id: stableId("node", `${ordinal}`, "list", block.items.join("")),
          type: "list",
          ordered: block.ordered,
          items: block.items.map((text, index) => ({
            id: stableId("item", `${ordinal}:${index}`, "list-item", text),
            text,
          })),
        });
        break;
      case "table": {
        const columns = block.columns.map((column, index) => ({
          id: stableId("col", `${ordinal}:${index}`, "column", column.header),
          header: column.header,
          align: column.align,
        }));
        appendBlock({
          id: stableId("node", `${ordinal}`, "table", JSON.stringify(block.rows)),
          type: "table",
          columns,
          rows: block.rows.map((row, rowIndex) => ({
            id: stableId("row", `${ordinal}:${rowIndex}`, "row", row.join("")),
            cells: row.map((text, cellIndex) => ({
              id: stableId("cell", `${ordinal}:${rowIndex}:${cellIndex}`, "cell", text),
              columnId: columns[cellIndex]?.id,
              text,
            })),
          })),
        });
        break;
      }
      case "figure": {
        const figure = figureQueue.shift();
        if (figure === undefined) {
          throw new MarkdownImportError(
            "IMPORT_ASSET_INVALID",
            "figure references exceed resolved assets",
          );
        }
        appendBlock({
          id: stableId("node", `${ordinal}`, "figure", figure.assetId),
          type: "figure",
          assetId: figure.assetId,
          altText: figure.alt,
        });
        break;
      }
      case "pageBreak":
        appendBlock({
          id: stableId("node", `${ordinal}`, "pageBreak", "source"),
          type: "pageBreak",
          reason: "source",
        });
        break;
      case "toc":
        appendBlock({
          id: stableId("node", `${ordinal}`, "toc", "toc"),
          type: "toc",
        });
        break;
    }
  }
  while (stack.length > 0) {
    closeSection();
  }

  return {
    schemaVersion: "0.2.0",
    documentId,
    revision: 0,
    title,
    language: "zh-CN",
    blocks: roots,
    assets: assets.map((asset) => ({ ...asset })),
  } as unknown as WenshuDocument;
}
