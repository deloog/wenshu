import type { TocEntry } from "@wenshu/document-model";

import { PdfExportError } from "./errors.ts";
import { decodePdfString, parseObjects } from "./inspect.ts";
import { normalizePdfText } from "./reconcile.ts";

/**
 * 目录页码测量（PA-11A 两遍渲染机制的测量半）：Chromium printToPDF
 * 由标题元素生成文档大纲（generateDocumentOutline 冻结为 true），大纲项
 * 携带标题文本与显式 /Dest 页——这是浏览器产生的结构事实，不是几何启发式。
 * 目录条目按文档序游标与大纲项逐一匹配；失配、缺大纲、未知 Dest 形式
 * 一律 fail-closed，绝不猜测页码。
 */

interface OutlineItem {
  readonly title: string;
  readonly pageObjectId: number;
}

function failPagination(message: string): never {
  throw new PdfExportError("PDF_EXPORT_PAGINATION_FAILED", message);
}

/** 解析 /Outlines 链表（先序遍历：根 /First 起步，兄弟 /Next，子级 /First）。 */
function collectOutlineItems(bytes: Uint8Array): readonly OutlineItem[] {
  const objects = parseObjects(bytes);
  let outlinesId: number | undefined;
  for (const [id, object] of objects) {
    if (/\/Type\s*\/Catalog/.test(object.dict)) {
      const ref = /\/Outlines\s+(\d+)\s+0\s+R/.exec(object.dict)?.[1];
      if (ref !== undefined) {
        outlinesId = Number(ref);
      }
    }
  }
  if (outlinesId === undefined) {
    failPagination("pdf lacks a document outline");
  }
  const root = objects.get(outlinesId);
  if (root === undefined || !/\/Type\s*\/Outlines/.test(root.dict)) {
    failPagination("outline root object is missing");
  }

  const items: OutlineItem[] = [];
  const visit = (refId: number | undefined): void => {
    let current = refId;
    while (current !== undefined) {
      const node = objects.get(current);
      if (node === undefined) {
        failPagination(`outline item ${current} is missing`);
      }
      const titleRaw = /\/Title\s*(<[^>]*>|\((?:[^()\\]|\\.)*\))/u.exec(
        node.dict,
      )?.[1];
      const dest = /\/Dest\s*\[\s*(\d+)\s+0\s+R\s+\/XYZ/u.exec(node.dict)?.[1];
      if (titleRaw === undefined || dest === undefined) {
        failPagination(`outline item ${current} lacks title or XYZ dest`);
      }
      items.push(
        Object.freeze({
          title: decodePdfString(titleRaw),
          pageObjectId: Number(dest),
        }),
      );
      const childRef = /\/First\s+(\d+)\s+0\s+R/.exec(node.dict)?.[1];
      if (childRef !== undefined) {
        visit(Number(childRef));
      }
      const nextRef = /\/Next\s+(\d+)\s+0\s+R/.exec(node.dict)?.[1];
      current = nextRef === undefined ? undefined : Number(nextRef);
    }
  };
  const firstRef = /\/First\s+(\d+)\s+0\s+R/.exec(root.dict)?.[1];
  if (firstRef !== undefined) {
    visit(Number(firstRef));
  }
  return Object.freeze(items);
}

/** 页对象号 → 物理页序：与 inspectPdf 相同的页面发现口径（文件序即页序）。 */
function pageIndexByObjectId(bytes: Uint8Array): ReadonlyMap<number, number> {
  const objects = parseObjects(bytes);
  const pageIds = [...objects.entries()]
    .filter(
      ([, object]) =>
        /\/Type\s*\/Page\b/.test(object.dict) && !/\/Type\s*\/Pages\b/.test(object.dict),
    )
    .map(([id]) => id);
  return new Map(pageIds.map((id, index) => [id, index]));
}

/**
 * 测量每个目录条目锚定章节的物理页码（pageIndex + 1）。
 * 文档序游标：条目按文档序消费大纲项，同文标题（封面题名双现等）由游标
 * 顺序消歧；条目在大纲中找不到后继匹配即失败。
 */
export function measureTocPageNumbers(
  bytes: Uint8Array,
  entries: readonly TocEntry[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  if (entries.length === 0) {
    return result;
  }
  const items = collectOutlineItems(bytes);
  const pageIndexById = pageIndexByObjectId(bytes);
  let cursor = 0;
  for (const entry of entries) {
    const want = normalizePdfText(entry.title);
    let matched: number | undefined;
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item !== undefined && normalizePdfText(item.title) === want) {
        const pageIndex = pageIndexById.get(item.pageObjectId);
        if (pageIndex === undefined) {
          failPagination("outline dest does not reference a known page");
        }
        matched = pageIndex + 1;
        break;
      }
    }
    if (matched === undefined) {
      failPagination("toc entry has no matching outline item (document order cursor)");
    }
    result.set(entry.id, matched);
  }
  return result;
}
