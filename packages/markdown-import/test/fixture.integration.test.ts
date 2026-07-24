import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { importMarkdownDocument, MarkdownImportError } from "../src/index.ts";

const fixture = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/golden-report.md",
);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("frozen golden report imports with zero content loss", async () => {
  const source = await readFile(fixture);
  const result = await importMarkdownDocument(fixture);
  const { document, reconciliation, renames } = result;

  // 对账平衡：每个源字符都有归属。
  assert.equal(
    reconciliation.contentChars +
      reconciliation.syntaxChars +
      reconciliation.newlineChars,
    reconciliation.sourceChars,
  );
  assert.equal(reconciliation.sourceChars, source.toString("utf8").length);

  // 逐行恒等式：每行的内容字符 + 语法字符 == 该行原始长度。
  const rawLines = source.toString("utf8").split("\n");
  for (const line of reconciliation.lines) {
    const raw = rawLines[line.line - 1];
    assert.ok(raw !== undefined, `line ${line.line} out of range`);
    assert.equal(
      line.contentChars + line.syntaxChars,
      raw.length,
      `line ${line.line} accounting mismatch`,
    );
  }

  // 构造清单：41 标题、2 图、5 表、1 引用、1 分页、21 列表项。
  assert.equal(reconciliation.counts["heading"], 41);
  assert.equal(reconciliation.counts["figure"], 2);
  assert.equal(reconciliation.counts["table-delimiter"], 5);
  assert.equal(reconciliation.counts["quote"], 1);
  assert.equal(reconciliation.counts["marker-page-break"], 1);
  assert.equal(reconciliation.counts["marker-toc"], 1);
  assert.equal(reconciliation.counts["list-item"], 21);

  // 资产按内容寻址重命名，字节身份与冻结 fixture 一致。
  for (const asset of document.assets) {
    const original = Object.entries(renames).find(([, path]) => path === asset.path);
    assert.ok(original, `asset ${asset.path} must map to a source reference`);
    const bytes = await readFile(resolve(fixture, "..", original?.[0] ?? ""));
    assert.equal(asset.sha256, sha256(bytes));
  }
  assert.equal(document.assets.length, 2);

  // 重解析确定性（稳定 ID 幂等）。
  const again = await importMarkdownDocument(fixture);
  assert.deepEqual(again.document, document);
});

test("asset references escaping the import root are rejected before reading", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-import-"));
  try {
    const source = ["---", "title: t", "---", "", "![图](../secret.png)"].join("\n");
    const file = join(root, "doc.md");
    await writeFile(file, source);
    await assert.rejects(
      () => importMarkdownDocument(file),
      (error: unknown) =>
        error instanceof MarkdownImportError && error.code === "IMPORT_ASSET_INVALID",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("assembled document violating the v0.1.0 contract is rejected at the schema gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-import-"));
  try {
    // 101 行表格使序数打包溢出（PA-A5 输入形态）：表一第 101 行首格与表二首格
    // 生成同一 cell ID，document-model 的重复 ID 守卫必须经由 schema 门禁 fail-closed。
    const rows = Array.from({ length: 101 }, (_, index) => `| 行${index} |`);
    rows[100] = "| 撞键 |";
    const source = [
      "---",
      "title: t",
      "---",
      "| 表一 |",
      "|---|",
      ...rows,
      "",
      "| 表二 |",
      "|---|",
      "| 撞键 |",
    ].join("\n");
    const file = join(root, "doc.md");
    await writeFile(file, source);
    await assert.rejects(
      () => importMarkdownDocument(file),
      (error: unknown) =>
        error instanceof MarkdownImportError &&
        error.code === "IMPORT_RECONCILE_FAILED" &&
        /v0\.1\.0 contract/u.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CRLF input reconciles against the raw file character count", async () => {
  const root = await mkdtemp(join(tmpdir(), "wenshu-import-"));
  try {
    const lf = ["---", "title: t", "---", "", "第一段。", "  ", "- 一", "- 二"].join(
      "\n",
    );
    const crlf = lf.replaceAll("\n", "\r\n");
    const file = join(root, "doc.md");
    await writeFile(file, crlf);
    const { document, reconciliation } = await importMarkdownDocument(file);
    assert.equal(document.blocks.length > 0, true);
    assert.equal(reconciliation.sourceChars, crlf.length);
    assert.equal(
      reconciliation.contentChars +
        reconciliation.syntaxChars +
        reconciliation.newlineChars,
      reconciliation.sourceChars,
    );
    const rawLines = crlf.split("\n");
    for (const line of reconciliation.lines) {
      assert.equal(
        line.contentChars + line.syntaxChars,
        rawLines[line.line - 1]?.length,
        `line ${line.line} accounting mismatch`,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verify wiring cannot omit the markdown import package", async () => {
  const packagePath = resolve(import.meta.dirname, "../../../package.json");
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  const scripts = (parsed as Record<string, unknown>)["scripts"];
  const contracts = String((scripts as Record<string, unknown>)["contracts:test"]);
  assert.match(contracts, /@wenshu\/markdown-import/u);
});
