import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  copyBlock,
  deleteBlock,
  fromProseMirrorDocument,
  insertBlock,
  moveBlock,
  rewriteBlock,
  toProseMirrorDocument,
  type IdAllocator,
  type IdPrefix,
} from "../src/index.ts";
import type { Block, SupportedDocument } from "@wenshu/document-model";

class SequenceAllocator implements IdAllocator {
  #next = 0;

  allocate(prefix: IdPrefix): string {
    this.#next += 1;
    return `${prefix}_${this.#next.toString(16).padStart(32, "0")}`;
  }
}

async function fullFixture(): Promise<SupportedDocument> {
  return JSON.parse(
    await readFile(
      new URL("../../document-model/fixtures/valid/full.json", import.meta.url),
      "utf8",
    ),
  ) as SupportedDocument;
}

function sampleDocument(): SupportedDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: "doc_00000000000000000000000000000001",
    revision: 0,
    title: "test",
    language: "zh-CN",
    assets: [],
    blocks: [
      { id: "node_00000000000000000000000000000011", type: "paragraph", text: "one" },
      { id: "node_00000000000000000000000000000012", type: "paragraph", text: "two" },
      {
        id: "node_00000000000000000000000000000013",
        type: "section",
        level: 1,
        title: "section",
        children: [
          {
            id: "node_00000000000000000000000000000014",
            type: "paragraph",
            text: "three",
          },
        ],
      },
    ],
  };
}

function blockIds(document: SupportedDocument): string[] {
  const ids: string[] = [];
  const visit = (block: Block): void => {
    ids.push(block.id);
    if (block.type === "section") block.children.forEach(visit);
    if (block.type === "list") block.items.forEach((item) => ids.push(item.id));
    if (block.type === "table") {
      block.columns.forEach((column) => ids.push(column.id));
      block.rows.forEach((row) => {
        ids.push(row.id);
        row.cells.forEach((cell) => ids.push(cell.id));
      });
    }
  };
  document.blocks.forEach(visit);
  return ids;
}

function assertSchemaAndUnique(document: SupportedDocument): void {
  const ids = [
    document.documentId,
    ...document.assets.map((asset) => asset.id),
    ...blockIds(document),
  ];
  assert.equal(new Set(ids).size, ids.length);
}

function assertUnchangedIdsRemain(
  before: SupportedDocument,
  after: SupportedDocument,
  removed: readonly string[] = [],
): void {
  const afterIds = new Set(blockIds(after));
  for (const id of blockIds(before)) {
    if (!removed.includes(id)) assert.ok(afterIds.has(id), `stable ID lost: ${id}`);
  }
}

test("complete G1-04 fixture round-trips through ProseMirror without loss", async () => {
  const fixture = await fullFixture();
  assert.deepEqual(fromProseMirrorDocument(toProseMirrorDocument(fixture)), fixture);
});

test("insert and copy allocate fresh identities while retaining every old identity", () => {
  const source = sampleDocument();
  const first = source.blocks[0];
  const section = source.blocks[2];
  if (first === undefined || section?.type !== "section")
    throw new Error("test fixture invalid");
  const allocator = new SequenceAllocator();
  const inserted = insertBlock(
    toProseMirrorDocument(source),
    source.documentId,
    first,
    allocator,
  );
  const afterInsert = fromProseMirrorDocument(inserted.document);
  assertUnchangedIdsRemain(source, afterInsert);
  assertSchemaAndUnique(afterInsert);
  const copied = copyBlock(inserted.document, section.id, source.documentId, allocator);
  const afterCopy = fromProseMirrorDocument(copied.document);
  assertUnchangedIdsRemain(afterInsert, afterCopy);
  assertSchemaAndUnique(afterCopy);
});

test("move, rewrite, and unrelated deletion preserve unaffected IDs", () => {
  const source = sampleDocument();
  const first = source.blocks[0];
  const second = source.blocks[1];
  const section = source.blocks[2];
  if (first === undefined || second === undefined || section?.type !== "section") {
    throw new Error("test fixture invalid");
  }
  const pm = toProseMirrorDocument(source);
  const moved = moveBlock(pm, first.id, section.id);
  const afterMove = fromProseMirrorDocument(moved.document);
  assertUnchangedIdsRemain(source, afterMove);
  const rewritten = rewriteBlock(moved.document, second.id, (block) =>
    block.type === "paragraph" ? { ...block, text: "rewritten" } : block,
  );
  const afterRewrite = fromProseMirrorDocument(rewritten.document);
  assertUnchangedIdsRemain(afterMove, afterRewrite);
  const deleted = deleteBlock(rewritten.document, second.id);
  const afterDelete = fromProseMirrorDocument(deleted.document);
  assertUnchangedIdsRemain(afterRewrite, afterDelete, [second.id]);
  assertSchemaAndUnique(afterDelete);
});

test("property probe: seeded ordinary edit sequences retain all unaffected IDs and schema validity", () => {
  const allocator = new SequenceAllocator();
  let pm = toProseMirrorDocument(sampleDocument());
  let seed = 0x5eed1234;
  const random = (): number => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed;
  };
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const before = fromProseMirrorDocument(pm);
    const roots = before.blocks.map((block) => block.id);
    const target = roots[random() % roots.length];
    if (target === undefined) throw new Error("property probe has no root");
    const action = random() % 3;
    if (action === 0) {
      pm = insertBlock(
        pm,
        before.documentId,
        {
          id: "node_ffffffffffffffffffffffffffffffff",
          type: "paragraph",
          text: "added",
        },
        allocator,
      ).document;
    } else if (action === 1 && roots.length > 1) {
      pm = moveBlock(pm, target, before.documentId).document;
    } else {
      pm = rewriteBlock(pm, target, (block) =>
        block.type === "paragraph" ? { ...block, text: `${block.text}!` } : block,
      ).document;
    }
    const after = fromProseMirrorDocument(pm);
    assertUnchangedIdsRemain(before, after);
    assertSchemaAndUnique(after);
  }
});

test("position-derived ID mutation is detected by the stability assertion", () => {
  const before = sampleDocument();
  const mutated = structuredClone(before);
  mutated.blocks.forEach((block, index) => {
    block.id = `node_${index.toString(16).padStart(32, "0")}`;
  });
  assert.throws(() => assertUnchangedIdsRemain(before, mutated), /stable ID lost/u);
});

test("operations reject schema-breaking deletion, cyclic move, and rewrite identity changes", () => {
  const source = sampleDocument();
  const pm = toProseMirrorDocument(source);
  const section = source.blocks[2];
  const first = source.blocks[0];
  const child = section?.type === "section" ? section.children[0] : undefined;
  if (section?.type !== "section") throw new Error("test fixture invalid");
  if (first === undefined || child === undefined) {
    throw new Error("test fixture invalid");
  }
  assert.throws(() => deleteBlock(pm, child.id), /PB02_OPERATION_SCHEMA_GUARD/u);
  assert.throws(() => moveBlock(pm, section.id, section.id), /PB02_OPERATION_CYCLE/u);
  assert.throws(
    () =>
      rewriteBlock(pm, first.id, (block) => ({
        ...block,
        id: "node_00000000000000000000000000000099",
      })),
    /PB02_OPERATION_ID_GUARD/u,
  );
});
