import assert from "node:assert/strict";
import test from "node:test";

import {
  importMarkdownDocumentFromText,
  MarkdownImportError,
} from "../src/index.ts";

const PNG_BYTES = new TextEncoder().encode("fake-png-bytes");
const SVG_BYTES = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");

function source(body: string): string {
  return ["---", "title: 测试文档", "---", "", body].join("\n");
}

function figureAlts(document: { blocks: readonly unknown[] }): string[] {
  const alts: string[] = [];
  const walk = (blocks: readonly unknown[]): void => {
    for (const value of blocks) {
      const block = value as Record<string, unknown>;
      if (block["type"] === "figure") {
        alts.push(String(block["altText"]));
      }
      if (Array.isArray(block["children"])) {
        walk(block["children"] as unknown[]);
      }
    }
  };
  walk(document.blocks);
  return alts;
}

test("all assets resolve: failedAssets empty, figures in document, books balance", async () => {
  const result = await importMarkdownDocumentFromText(
    source("正文段落。\n\n![图一](images/a.png)\n\n![图二](b.svg)"),
    "doc.md",
    (reference) =>
      Promise.resolve(reference.endsWith(".svg") ? SVG_BYTES : PNG_BYTES),
  );
  assert.equal(result.failedAssets.length, 0);
  assert.deepEqual(figureAlts(result.document), ["图一", "图二"]);
  assert.equal(result.document.assets.length, 2);
  assert.equal(
    result.reconciliation.contentChars +
      result.reconciliation.syntaxChars +
      result.reconciliation.newlineChars,
    result.reconciliation.sourceChars,
  );
  assert.equal(result.renames["images/a.png"], result.document.assets[0]?.path);
  assert.equal(result.renames["b.svg"], result.document.assets[1]?.path);
});

test("single asset missing: partial collection, figure excluded, reconciliation holds", async () => {
  const result = await importMarkdownDocumentFromText(
    source("正文段落。\n\n![图一](a.png)\n\n![图二](missing.png)"),
    "doc.md",
    (reference) =>
      Promise.resolve(reference === "a.png" ? PNG_BYTES : undefined),
  );
  assert.deepEqual(
    result.failedAssets.map((failed) => ({
      reference: failed.reference,
      reasonCode: failed.reasonCode,
    })),
    [{ reference: "missing.png", reasonCode: "asset_not_provided" }],
  );
  // 失败的 figure 不进文档、不进 renames。
  assert.deepEqual(figureAlts(result.document), ["图一"]);
  assert.equal(result.document.assets.length, 1);
  assert.equal(result.renames["missing.png"], undefined);
  // 失败行是存在过的引用行：对账仍真实闭合。
  assert.equal(result.reconciliation.counts["figure"], 2);
  assert.equal(
    result.reconciliation.contentChars +
      result.reconciliation.syntaxChars +
      result.reconciliation.newlineChars,
    result.reconciliation.sourceChars,
  );
});

test("resolver throwing maps to asset_unreadable", async () => {
  const result = await importMarkdownDocumentFromText(
    source("正文。\n\n![图](a.png)"),
    "doc.md",
    () => Promise.reject(new Error("disk gone")),
  );
  assert.equal(result.failedAssets.length, 1);
  assert.equal(result.failedAssets[0]?.reasonCode, "asset_unreadable");
  assert.equal(result.document.assets.length, 0);
});

test("escape and non-whitelist references degrade to asset_type_unsupported", async () => {
  const result = await importMarkdownDocumentFromText(
    source(
      "正文。\n\n![逃逸](../secret.png)\n\n![相对](./a.png)\n\n![类型](a.gif)",
    ),
    "doc.md",
    () => Promise.resolve(PNG_BYTES),
  );
  assert.equal(result.failedAssets.length, 3);
  for (const failed of result.failedAssets) {
    assert.equal(failed.reasonCode, "asset_type_unsupported");
  }
  assert.equal(result.document.assets.length, 0);
  // resolver 绝不被逃逸/非白名单引用触达（规则在调用回调之前拦截）。
});

test("escape-reference resolver is never invoked", async () => {
  const seen: string[] = [];
  await importMarkdownDocumentFromText(
    source("正文。\n\n![逃逸](../secret.png)"),
    "doc.md",
    (reference) => {
      seen.push(reference);
      return Promise.resolve(PNG_BYTES);
    },
  );
  assert.deepEqual(seen, []);
});

test("all figures fail but body succeeds: normal return with every failure recorded", async () => {
  const result = await importMarkdownDocumentFromText(
    source("正文段落。\n\n![图一](a.png)\n\n![图二](b.png)"),
    "doc.md",
    () => Promise.resolve(undefined),
  );
  assert.equal(result.failedAssets.length, 2);
  assert.deepEqual(figureAlts(result.document), []);
  assert.equal(result.document.assets.length, 0);
  assert.deepEqual(result.renames, {});
  // 正文块仍在文档中，对账平衡。
  assert.equal(
    result.reconciliation.contentChars +
      result.reconciliation.syntaxChars +
      result.reconciliation.newlineChars,
    result.reconciliation.sourceChars,
  );
});

test("all blocks are figures and all fail: whole import fails IMPORT_RECONCILE_FAILED", async () => {
  await assert.rejects(
    () =>
      importMarkdownDocumentFromText(
        source("![图一](a.png)\n\n![图二](b.png)"),
        "doc.md",
        () => Promise.resolve(undefined),
      ),
    (error: unknown) =>
      error instanceof MarkdownImportError &&
      error.code === "IMPORT_RECONCILE_FAILED",
  );
});

test("duplicate references to the same bytes resolve to one content-addressed asset", async () => {
  const result = await importMarkdownDocumentFromText(
    source("正文。\n\n![甲](x/a.png)\n\n![乙](y/a.png)"),
    "doc.md",
    () => Promise.resolve(PNG_BYTES),
  );
  assert.equal(result.failedAssets.length, 0);
  assert.equal(result.document.assets.length, 1);
  assert.equal(result.renames["x/a.png"], result.renames["y/a.png"]);
});
