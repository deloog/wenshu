import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { WenshuDocument } from "@wenshu/document-model";

import { WorkspaceController } from "../src/workspace/controller.ts";
import { buildSampleImportMeta } from "../src/workspace/sample-document.ts";

const hex = (seed: string): string => seed.padEnd(32, "0").slice(0, 32);
const node = (seed: string): string => `node_${hex(seed)}`;

function doc(overrides?: Partial<WenshuDocument>): WenshuDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: `doc_${hex("d001")}`,
    revision: 1,
    title: "测试文档",
    language: "zh-CN",
    assets: [],
    blocks: [
      {
        id: node("5001"),
        type: "section",
        level: 1,
        title: "标题甲",
        children: [
          { id: node("9001"), type: "paragraph", text: "第一段" },
          { id: node("9002"), type: "paragraph", text: "第二段" },
        ],
      },
      { id: node("9003"), type: "paragraph", text: "根级段落" },
    ],
    ...overrides,
  };
}

function press(
  controller: WorkspaceController,
  key: string,
  mods?: { ctrl?: boolean; shift?: boolean },
): Promise<boolean> {
  return controller.handleKey({
    key,
    ctrlKey: mods?.ctrl ?? false,
    shiftKey: mods?.shift ?? false,
  });
}

/** 把焦点移到指定 blockId/itemId 所在行并返回行号。 */
async function focusOn(controller: WorkspaceController, id: string): Promise<number> {
  const rows = controller.snapshot().rows;
  const target = rows.findIndex((row) =>
    row.kind === "item" ? row.itemId === id : row.blockId === id,
  );
  assert.notEqual(target, -1, `row for ${id} exists`);
  const current = controller.snapshot().focus.rowIndex;
  const delta = target - current;
  const steps = Math.abs(delta);
  for (let index = 0; index < steps; index += 1) {
    await press(controller, delta > 0 ? "ArrowDown" : "ArrowUp");
  }
  assert.equal(controller.snapshot().focus.rowIndex, target);
  return target;
}

describe("A-03 workspace: focus/caret + confirm phase", () => {
  it("import meta present → confirm phase; Enter confirms, Escape skips (separate controllers)", async () => {
    const confirming = new WorkspaceController(doc(), buildSampleImportMeta());
    assert.equal(confirming.snapshot().phase, "confirm");
    assert.equal(
      await press(confirming, "x"),
      false,
      "confirm phase swallows non-Enter/Escape",
    );
    await press(confirming, "Enter");
    assert.equal(confirming.snapshot().phase, "editing");
    assert.equal(confirming.snapshot().confirmationOutcome, "confirmed");

    const skipping = new WorkspaceController(doc(), buildSampleImportMeta());
    await press(skipping, "Escape");
    assert.equal(skipping.snapshot().confirmationOutcome, "skipped");

    const plain = new WorkspaceController(doc());
    assert.equal(
      plain.snapshot().phase,
      "editing",
      "no import meta → straight to editing",
    );
  });

  it("arrow keys move focus; caret moves inside text and spills to neighbour rows", async () => {
    const controller = new WorkspaceController(doc());
    assert.equal(controller.snapshot().focus.rowIndex, 0);
    await press(controller, "ArrowDown");
    assert.equal(controller.snapshot().focus.rowIndex, 1);
    // row 1 = paragraph 第一段 (3 chars); caret end + right spills to next row.
    for (let index = 0; index < 3; index += 1) await press(controller, "ArrowRight");
    assert.equal(controller.snapshot().focus.offset, 3);
    await press(controller, "ArrowRight");
    assert.equal(controller.snapshot().focus.rowIndex, 2);
    assert.equal(controller.snapshot().focus.offset, 0);
    await press(controller, "ArrowLeft");
    assert.equal(controller.snapshot().focus.rowIndex, 1);
    assert.equal(controller.snapshot().focus.offset, 3);
  });
});

describe("A-03 workspace: text editing via rewrite commands", () => {
  it("printable input inserts at caret; backspace deletes before caret; forward delete after", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("9001"));
    await press(controller, "ArrowRight"); // caret after 第
    await press(controller, "X");
    assert.deepEqual(controller.snapshot().rows[1], {
      kind: "paragraph",
      blockId: node("9001"),
      text: "第X一段",
    });
    await press(controller, "Backspace");
    assert.deepEqual(controller.snapshot().rows[1], {
      kind: "paragraph",
      blockId: node("9001"),
      text: "第一段",
    });
    assert.equal(controller.snapshot().focus.offset, 1);
    await press(controller, "Delete");
    assert.deepEqual(controller.snapshot().rows[1], {
      kind: "paragraph",
      blockId: node("9001"),
      text: "第段",
    });
  });

  it("Enter splits a paragraph at the caret (insert + rewrite in one transaction)", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("9001"));
    await press(controller, "ArrowRight"); // caret between 第 and 一段
    await press(controller, "Enter");
    const snapshot = controller.snapshot();
    const paragraphs = snapshot.document.blocks[0];
    assert.equal(paragraphs?.type, "section");
    if (paragraphs?.type !== "section") return;
    assert.equal(paragraphs.children.length, 3);
    assert.deepEqual(
      paragraphs.children.map((block) =>
        block.type === "paragraph" ? block.text : block.type,
      ),
      ["第", "一段", "第二段"],
    );
    assert.equal(
      paragraphs.children[0]?.id,
      node("9001"),
      "first half keeps the original id",
    );
    assert.match(paragraphs.children[1]?.id ?? "", /^node_[0-9a-f]{32}$/);
    assert.notEqual(paragraphs.children[1]?.id, node("9001"));
  });

  it("Enter at text edge fails closed (BodyText minLength 1), document unchanged", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("9001"));
    const before = controller.snapshot().document;
    await press(controller, "Enter"); // caret at 0
    assert.match(controller.snapshot().status, /空块不入契约/);
    assert.deepEqual(controller.snapshot().document, before);
  });

  it("backspace at paragraph start merges into previous paragraph, same container only", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("9002"));
    await press(controller, "Backspace"); // caret already 0
    const section = controller.snapshot().document.blocks[0];
    assert.equal(section?.type, "section");
    if (section?.type !== "section") return;
    assert.equal(section.children.length, 1);
    assert.deepEqual(section.children[0], {
      id: node("9001"),
      type: "paragraph",
      text: "第一段第二段",
    });
    assert.equal(controller.snapshot().focus.offset, 3, "caret at merge seam");
  });

  it("backspace at section-first paragraph start refuses cross-container merge", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("9001"));
    const before = controller.snapshot().document;
    await press(controller, "Backspace");
    assert.match(controller.snapshot().status, /不合并|仅段落/);
    assert.deepEqual(controller.snapshot().document, before);
  });
});

describe("A-03 workspace: heading level + D1 type corrections", () => {
  it("Tab/Shift+Tab adjust heading level within 1–6 and clamp honestly", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("5001"));
    await press(controller, "Tab");
    let section = controller.snapshot().document.blocks[0];
    assert.equal(section?.type === "section" ? section.level : 0, 2);
    await press(controller, "Tab", { shift: true });
    section = controller.snapshot().document.blocks[0];
    assert.equal(section?.type === "section" ? section.level : 0, 1);
    await press(controller, "Tab", { shift: true });
    assert.match(controller.snapshot().status, /最浅 1/);
    section = controller.snapshot().document.blocks[0];
    assert.equal(
      section?.type === "section" ? section.level : 0,
      1,
      "clamp keeps level 1",
    );
  });

  it("Ctrl+T promotes paragraph: wrapped by a new section titled with its text, paragraph id preserved as child", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("9002"));
    await press(controller, "t", { ctrl: true });
    const section = controller.snapshot().document.blocks[0];
    assert.equal(section?.type, "section");
    if (section?.type !== "section") return;
    const promoted = section.children[1];
    assert.equal(
      promoted?.type,
      "section",
      "paragraph position now holds a new section",
    );
    if (promoted?.type !== "section") return;
    assert.match(promoted.id, /^node_[0-9a-f]{32}$/);
    assert.notEqual(promoted.id, node("9002"), "the wrapping section is a NEW node");
    assert.equal(promoted.level, 1);
    assert.equal(promoted.title, "第二段", "section title takes the paragraph text");
    assert.deepEqual(
      promoted.children.map((block) => block.id),
      [node("9002")],
      "original paragraph preserved as the section's child (id kept)",
    );
  });

  it("Ctrl+T demotes a section to paragraph: title becomes new node, child ids preserved", async () => {
    const controller = new WorkspaceController(doc());
    await focusOn(controller, node("5001"));
    await press(controller, "t", { ctrl: true });
    const blocks = controller.snapshot().document.blocks;
    assert.equal(
      blocks.length,
      4,
      "title paragraph + 2 lifted children + root paragraph",
    );
    const [titleParagraph, ...rest] = blocks;
    assert.equal(titleParagraph?.type, "paragraph");
    assert.equal(
      titleParagraph?.type === "paragraph" ? titleParagraph.text : "",
      "标题甲",
    );
    assert.match(titleParagraph?.id ?? "", /^node_[0-9a-f]{32}$/);
    assert.notEqual(
      titleParagraph?.id,
      node("5001"),
      "demoted title paragraph is a NEW node",
    );
    assert.deepEqual(
      rest.slice(0, 2).map((block) => block.id),
      [node("9001"), node("9002")],
      "children lifted one level, ids preserved",
    );
    assert.equal(rest[2]?.id, node("9003"), "root paragraph untouched");
  });
});
