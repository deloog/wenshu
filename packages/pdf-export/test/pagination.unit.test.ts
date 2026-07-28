import assert from "node:assert/strict";
import test from "node:test";

import { measureTocPageNumbers, PdfExportError } from "../src/index.ts";

/**
 * 目录页码测量单元测试（PA-11A）：手工构造最小 PDF 对象图（parser 只需要
 * `N 0 obj … endobj`），断言大纲先序遍历、文档序游标消歧与全部 fail-closed 面。
 */

function buildPdf(objects: readonly string[]): Uint8Array {
  const body = objects
    .map((object, index) => `${index + 1} 0 obj\n${object}\nendobj`)
    .join("\n");
  return new Uint8Array(Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, "latin1"));
}

function titleHex(text: string): string {
  return `FEFF${Buffer.from(text, "utf16le").swap16().toString("hex").toUpperCase()}`;
}

const entry = (id: string, title: string) => Object.freeze({ id, title, level: 1 });

test("outline items map toc entries to physical page numbers in document order", () => {
  const pdf = buildPdf([
    "<</Type/Catalog/Outlines 5 0 R>>",
    "<</Type/Page>>",
    "<</Type/Page>>",
    "<</Type/Page>>",
    "<</Type/Outlines/First 6 0 R/Last 6 0 R>>",
    // 同名标题双现（封面题名场景）：游标按文档序消歧。
    `<</Title <${titleHex("报告")}>/Dest [2 0 R /XYZ 0 0 0]/Parent 5 0 R/Next 7 0 R>>`,
    `<</Title <${titleHex("报告")}>/Dest [3 0 R /XYZ 0 0 0]/Parent 5 0 R/Next 8 0 R>>`,
    `<</Title <${titleHex("执行摘要")}>/Dest [4 0 R /XYZ 0 0 0]/Parent 5 0 R>>`,
  ]);
  const pages = measureTocPageNumbers(pdf, [
    entry("node_a", "报告"),
    entry("node_b", "报告"),
    entry("node_c", "执行摘要"),
  ]);
  assert.equal(pages.get("node_a"), 1);
  assert.equal(pages.get("node_b"), 2);
  assert.equal(pages.get("node_c"), 3);
});

test("nested outline children are walked pre-order", () => {
  const pdf = buildPdf([
    "<</Type/Catalog/Outlines 4 0 R>>",
    "<</Type/Page>>",
    "<</Type/Page>>",
    "<</Type/Outlines/First 5 0 R/Last 5 0 R>>",
    `<</Title <${titleHex("章")}>/Dest [2 0 R /XYZ 0 0 0]/Parent 4 0 R/First 6 0 R/Last 6 0 R>>`,
    `<</Title <${titleHex("节")}>/Dest [3 0 R /XYZ 0 0 0]/Parent 5 0 R>>`,
  ]);
  const pages = measureTocPageNumbers(pdf, [
    entry("node_a", "章"),
    entry("node_b", "节"),
  ]);
  assert.equal(pages.get("node_a"), 1);
  assert.equal(pages.get("node_b"), 2);
});

test("empty entry list needs no outline at all", () => {
  const pdf = buildPdf(["<</Type/Catalog>>", "<</Type/Page>>"]);
  assert.equal(measureTocPageNumbers(pdf, []).size, 0);
});

test("missing outline fails closed", () => {
  const pdf = buildPdf(["<</Type/Catalog>>", "<</Type/Page>>"]);
  assert.throws(
    () => measureTocPageNumbers(pdf, [entry("node_a", "章")]),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_PAGINATION_FAILED",
  );
});

test("entry without a remaining matching outline item fails closed", () => {
  const pdf = buildPdf([
    "<</Type/Catalog/Outlines 3 0 R>>",
    "<</Type/Page>>",
    "<</Type/Outlines/First 4 0 R/Last 4 0 R>>",
    `<</Title <${titleHex("别的")}>/Dest [2 0 R /XYZ 0 0 0]/Parent 3 0 R>>`,
  ]);
  assert.throws(
    () => measureTocPageNumbers(pdf, [entry("node_a", "不存在的标题")]),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_PAGINATION_FAILED",
  );
});

test("non-XYZ destination form fails closed", () => {
  const pdf = buildPdf([
    "<</Type/Catalog/Outlines 3 0 R>>",
    "<</Type/Page>>",
    "<</Type/Outlines/First 4 0 R/Last 4 0 R>>",
    `<</Title <${titleHex("章")}>/Dest [2 0 R /Fit]/Parent 3 0 R>>`,
  ]);
  assert.throws(
    () => measureTocPageNumbers(pdf, [entry("node_a", "章")]),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_PAGINATION_FAILED",
  );
});
