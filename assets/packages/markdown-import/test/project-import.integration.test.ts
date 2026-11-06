import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isImportedOriginal } from "@wenshu/project-storage";

import {
  importMarkdownDocument,
  importMarkdownDocumentFromText,
  importMarkdownProject,
  type ImportProjectProgress,
} from "../src/index.ts";
import {
  makeHarness,
  PNG_A,
  PNG_B,
  sha256,
  SOURCE_BYTES,
  SOURCE_TEXT,
} from "./project-import-helpers.ts";

test("full import: staging -> atomic rename -> layout, bytes, protection, progress", async () => {
  const harness = await makeHarness();
  try {
    const sourceHashBefore = sha256(new Uint8Array(await readFile(harness.sourcePath)));
    const progress: ImportProjectProgress[] = [];
    const result = await importMarkdownProject({
      grants: harness.grants,
      projectGrantId: harness.projectGrantId,
      targetDirName: "report-project",
      sourceGrantId: harness.sourceGrantId,
      assetGrantIds: harness.assetGrantIds,
      onProgress: (entry) => progress.push(entry),
    });
    assert.equal(result.status, "success");
    if (result.status !== "success") {
      return;
    }
    const target = join(harness.grantRoot, "report-project");
    // 布局：document.json + assets/<sha16>.<ext> + materials/<sha16>.md。
    const documentBytes = new Uint8Array(await readFile(join(target, "document.json")));
    assert.equal(result.documentSha256, sha256(documentBytes));
    const document = JSON.parse(new TextDecoder().decode(documentBytes)) as {
      assets: readonly { path: string }[];
      blocks: readonly unknown[];
    };
    assert.equal(document.assets.length, 2);
    const assetNames = await readdir(join(target, "assets"));
    assert.equal(assetNames.length, 2);
    for (const imported of result.importedAssets) {
      assert.ok(assetNames.includes(imported.fileName));
      assert.equal(imported.path, `assets/${imported.fileName}`);
    }
    const materialBytes = new Uint8Array(
      await readFile(join(target, "materials", result.materialName)),
    );
    assert.equal(sha256(materialBytes), sha256(SOURCE_BYTES));
    // 原名永不落盘：report.md / a.png / b.png 不出现在目标树。
    assert.ok(!assetNames.includes("a.png") && !assetNames.includes("b.png"));
    assert.ok(result.materialName !== "report.md");
    // D3：原件副本与资源副本平文件名均已保护登记。
    const grant = harness.grants.resolve(harness.projectGrantId);
    assert.ok(grant !== undefined);
    assert.ok(isImportedOriginal(grant, result.materialName));
    for (const imported of result.importedAssets) {
      assert.ok(isImportedOriginal(grant, imported.fileName));
    }
    // 无临时目录残留。
    const siblings = await readdir(harness.grantRoot);
    assert.deepEqual(siblings, ["report-project"]);
    // 原件哈希不变。
    assert.equal(
      sha256(new Uint8Array(await readFile(harness.sourcePath))),
      sourceHashBefore,
    );
    // 进度：四阶段齐备，各阶段 completed 单调且不超过 total。
    const phases = ["read", "parse", "write", "finalize"] as const;
    for (const phase of phases) {
      const entries = progress.filter((entry) => entry.phase === phase);
      assert.ok(entries.length > 0, `phase ${phase} must report progress`);
      let previous = 0;
      for (const entry of entries) {
        assert.ok(entry.completed > previous, `${phase} completed must increase`);
        assert.ok(entry.completed <= entry.total);
        previous = entry.completed;
      }
      assert.equal(entries[entries.length - 1]?.completed, entries[0]?.total);
    }
  } finally {
    await harness.cleanup();
  }
});

test("partial import: missing asset recorded, document excludes it, successes land", async () => {
  const harness = await makeHarness({
    assetFiles: [{ dir: "images", name: "a.png", bytes: PNG_A }],
  });
  try {
    const sourceHashBefore = sha256(new Uint8Array(await readFile(harness.sourcePath)));
    const result = await importMarkdownProject({
      grants: harness.grants,
      projectGrantId: harness.projectGrantId,
      targetDirName: "partial-project",
      sourceGrantId: harness.sourceGrantId,
      assetGrantIds: harness.assetGrantIds,
    });
    assert.equal(result.status, "partial");
    if (result.status !== "partial") {
      return;
    }
    assert.deepEqual(
      result.failedAssets.map((failed) => ({
        fileName: failed.fileName,
        reasonCode: failed.reasonCode,
        retryable: failed.retryable,
      })),
      [{ fileName: "b.png", reasonCode: "asset_not_provided", retryable: true }],
    );
    assert.equal(result.importedAssets.length, 1);
    const target = join(harness.grantRoot, "partial-project");
    const assetNames = await readdir(join(target, "assets"));
    assert.equal(assetNames.length, 1);
    assert.equal(assetNames[0], result.importedAssets[0]?.fileName);
    const document = JSON.parse(
      new TextDecoder().decode(await readFile(join(target, "document.json"))),
    ) as { assets: readonly unknown[] };
    assert.equal(document.assets.length, 1);
    // 未选文件的原件从未被读取、从未落盘。
    assert.equal(
      sha256(new Uint8Array(await readFile(harness.sourcePath))),
      sourceHashBefore,
    );
  } finally {
    await harness.cleanup();
  }
});

test("ambiguous basename among selected assets records asset_ambiguous", async () => {
  const harness = await makeHarness({
    assetFiles: [
      { dir: "images", name: "a.png", bytes: PNG_A },
      { dir: "", name: "a.png", bytes: PNG_B },
      { dir: "", name: "b.png", bytes: PNG_B },
    ],
  });
  try {
    const result = await importMarkdownProject({
      grants: harness.grants,
      projectGrantId: harness.projectGrantId,
      targetDirName: "ambiguous-project",
      sourceGrantId: harness.sourceGrantId,
      assetGrantIds: harness.assetGrantIds,
    });
    assert.equal(result.status, "partial");
    if (result.status !== "partial") {
      return;
    }
    assert.equal(result.failedAssets.length, 1);
    assert.equal(result.failedAssets[0]?.reasonCode, "asset_ambiguous");
    assert.equal(result.failedAssets[0]?.fileName, "a.png");
    assert.equal(result.importedAssets.length, 1);
  } finally {
    await harness.cleanup();
  }
});

test("text entry and path entry produce identical documents (shared core)", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-equivalence-"));
  try {
    await mkdir(join(root, "images"), { recursive: true });
    await writeFile(join(root, "images", "a.png"), PNG_A);
    await writeFile(join(root, "b.png"), PNG_B);
    const sourcePath = join(root, "doc.md");
    await writeFile(sourcePath, SOURCE_BYTES);
    const viaPath = await importMarkdownDocument(sourcePath, root);
    const viaText = await importMarkdownDocumentFromText(
      SOURCE_TEXT,
      "doc.md",
      (reference) => {
        const name = reference.split("/").pop() ?? reference;
        const bytes = name === "a.png" ? PNG_A : PNG_B;
        return Promise.resolve(bytes);
      },
    );
    assert.deepEqual(viaText.document, viaPath.document);
    assert.deepEqual(viaText.renames, viaPath.renames);
    assert.equal(viaText.failedAssets.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
