/**
 * A-03 keyboard workspace E2E (task book minimum evidence). Every run spawns
 * the real Electron binary (e2e-main.cjs, E2E_SCENARIO_MODE=workspace) which
 * loads the REAL apps/web workspace IIFE bundle; the document crosses the
 * grant-gated wenshu.project.document.read channel; every key is replayed
 * main-process-side through Chromium's trusted input pipeline
 * (sendInputEvent) — the renderer tallies event.isTrusted to prove no
 * synthetic dispatchEvent slipped in. Nothing mocks the document, the
 * channel, the TransactionManager, or the key events.
 *
 * Sub-scenarios:
 *   editing          44-key script covering EVERY structural operation
 *                    keyboard-only + undo/redo fork + stable-ID invariants
 *   confirm-enter    D1 confirm phase: Enter confirms, outcome=confirmed
 *   confirm-skip     D1 confirm phase is skippable: Escape, outcome=skipped
 *   corrupt          document.json unparsable -> fail-closed "corrupt"
 *   schema-invalid   schema-breaking document.json -> DOCUMENT_INVALID
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { validateDocument, type SupportedDocument } from "@wenshu/document-model";

import {
  awaitExit,
  readReport,
  sha256File,
  spawnE2E,
  waitForReportLines,
} from "./pb-12-orchestrator.ts";

const hex = (seed: string): string => seed.padEnd(32, "0").slice(0, 32);
const node = (seed: string): string => `node_${hex(seed)}`;
const item = (seed: string): string => `item_${hex(seed)}`;
const col = (seed: string): string => `col_${hex(seed)}`;
const row = (seed: string): string => `row_${hex(seed)}`;
const cell = (seed: string): string => `cell_${hex(seed)}`;

const IDS = {
  section: node("5001"),
  p1: node("9001"),
  p2: node("9002"),
  p3: node("9003"),
  list1: node("1101"),
  list2: node("1102"),
  i1: item("a101"),
  i2: item("a102"),
  i3: item("a103"),
  table: node("7a01"),
  pageBreak: node("b001"),
} as const;

function workspaceDocument(): SupportedDocument {
  return {
    schemaVersion: "0.2.0",
    documentId: `doc_${hex("a030")}`,
    revision: 1,
    title: "A-03 E2E 工作区",
    language: "zh-CN",
    assets: [],
    blocks: [
      {
        id: IDS.section,
        type: "section",
        level: 1,
        title: "一、概述",
        children: [
          { id: IDS.p1, type: "paragraph", text: "第一段文本" },
          { id: IDS.p2, type: "paragraph", text: "第二段文本" },
        ],
      },
      {
        id: IDS.list1,
        type: "list",
        ordered: false,
        items: [
          { id: IDS.i1, text: "甲" },
          { id: IDS.i2, text: "乙" },
        ],
      },
      {
        id: IDS.list2,
        type: "list",
        ordered: false,
        items: [{ id: IDS.i3, text: "丙" }],
      },
      {
        id: IDS.table,
        type: "table",
        columns: [
          { id: col("c001"), header: "指标", align: "start" },
          { id: col("c002"), header: "数值", align: "end" },
        ],
        rows: [
          {
            id: row("b001"),
            cells: [
              { id: cell("e001"), columnId: col("c001"), text: "甲" },
              { id: cell("e002"), columnId: col("c002"), text: "1" },
            ],
          },
          {
            id: row("b002"),
            cells: [
              { id: cell("e003"), columnId: col("c001"), text: "乙" },
              { id: cell("e004"), columnId: col("c002"), text: "2" },
            ],
          },
        ],
      },
      { id: IDS.pageBreak, type: "pageBreak", reason: "source" },
      { id: IDS.p3, type: "paragraph", text: "收尾段落" },
    ],
  };
}

interface KeyStep {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
}

const K = (key: string, mods?: { ctrl?: boolean; shift?: boolean }): KeyStep => ({
  key,
  ...mods,
});

/**
 * Deterministic 44-key walk across the whole keyboard vocabulary (see the
 * block comment in the task book): text insert, paragraph split/merge,
 * heading level, promote/demote, list merge/split, block move, table row &
 * column insert/delete, block delete, undo×2, redo, fork edit.
 */
const EDITING_SCRIPT: readonly KeyStep[] = [
  K("ArrowDown"),
  K("x"), // type into 第一段文本 -> "x第一段文本"
  K("Enter"), // split paragraph at caret 1: "x" + "第一段文本"
  K("ArrowDown"),
  K("ArrowLeft"), // caret to 0 of the second half
  K("Backspace"), // merge halves back: "x第一段文本"
  K("ArrowUp"),
  K("Tab"), // heading level 1 -> 2
  K("Tab", { shift: true }), // 2 -> 1
  K("ArrowDown"),
  K("t", { ctrl: true }), // promote paragraph -> new section (id preserved as child)
  K("ArrowUp"),
  K("t", { ctrl: true }), // demote that section -> title paragraph + child preserved
  K("ArrowDown"),
  K("ArrowDown"),
  K("ArrowDown"),
  K("ArrowDown"), // focus item 乙
  K("m", { ctrl: true }), // merge the two adjacent lists (item ids preserved)
  K("ArrowDown"), // focus item 丙
  K("Enter", { ctrl: true }), // split list before 丙 (new list node)
  K("ArrowUp"),
  K("ArrowUp"),
  K("ArrowUp"),
  K("ArrowUp"), // focus paragraph "x第一段文本"
  K("ArrowDown", { ctrl: true }), // move it one block down
  K("ArrowDown"),
  K("ArrowDown"),
  K("ArrowDown"),
  K("ArrowDown"), // focus the table row
  K("Enter"), // enter table mode
  K("Enter", { ctrl: true }), // insert table row
  K("ArrowDown"), // select the new row
  K("Delete"), // delete it
  K("]", { ctrl: true }), // insert table column ("新列")
  K("ArrowRight"), // select the new column
  K("[", { ctrl: true }), // delete it
  K("Escape"), // leave table mode
  K("ArrowDown"), // focus the pageBreak
  K("Delete"), // delete the pageBreak block
  K("z", { ctrl: true }), // undo: pageBreak restored
  K("z", { ctrl: true }), // undo: column delete reverted (3 columns)
  K("y", { ctrl: true }), // redo: column deleted again (2 columns)
  K("ArrowDown"), // focus 收尾段落
  K("y"), // fork: type "y" -> redo stack must clear
];

interface WorkspaceResult {
  readonly documentSha256: string;
  readonly keyStats: { readonly total: number; readonly trusted: number };
  readonly snapshot: {
    readonly phase: string;
    readonly confirmationOutcome?: string;
    readonly status: string;
    readonly undoDepth: number;
    readonly redoDepth: number;
    readonly document: SupportedDocument;
    readonly importMeta?: { failedAssets: readonly { fileName: string }[] };
  };
}

async function runWorkspace(options: {
  readonly document?: unknown;
  readonly script: readonly KeyStep[];
  readonly importMeta?: boolean;
}): Promise<{
  readonly lines: readonly Record<string, unknown>[];
  readonly workdir: string;
}> {
  const workdir = await mkdtemp(join(tmpdir(), "wenshu-a03-"));
  const reportDir = await mkdtemp(join(tmpdir(), "wenshu-a03-report-"));
  if (options.document !== undefined) {
    await writeFile(join(workdir, "document.json"), JSON.stringify(options.document));
  }
  const proc = spawnE2E({
    workdir,
    reportDir,
    extraEnv: {
      E2E_SCENARIO_MODE: "workspace",
      E2E_KEY_SCRIPT: JSON.stringify(options.script),
      ...(options.importMeta === true ? { E2E_WORKSPACE_IMPORT_META: "1" } : {}),
    },
  });
  try {
    await waitForReportLines(
      proc.reportPath,
      (lines) =>
        lines.some(
          (line) =>
            line["type"] === "workspace-result" || line["type"] === "workspace-error",
        ),
      120_000,
    );
    const exit = await awaitExit(proc, 30_000);
    assert.equal(exit.code, 0, `electron exit code\n${proc.stderrTail()}`);
    return { lines: await readReport(proc.reportPath), workdir };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    await rm(reportDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function resultOf(lines: readonly Record<string, unknown>[]): WorkspaceResult {
  const line = lines.find((entry) => entry["type"] === "workspace-result");
  assert.ok(line !== undefined, `no workspace-result line: ${JSON.stringify(lines)}`);
  return line as unknown as WorkspaceResult;
}

function errorOf(lines: readonly Record<string, unknown>[]): string {
  const line = lines.find((entry) => entry["type"] === "workspace-error");
  assert.ok(line !== undefined, `no workspace-error line: ${JSON.stringify(lines)}`);
  return String(line["error"]);
}

test("editing: 44 trusted keys drive every structural op; end state exact; ids stable", async () => {
  const source = workspaceDocument();
  const { lines, workdir } = await runWorkspace({
    document: source,
    script: EDITING_SCRIPT,
  });
  const result = resultOf(lines);
  void workdir;

  // Trusted pipeline proof: every keydown the page saw was a real one.
  assert.equal(
    result.keyStats.total,
    EDITING_SCRIPT.length,
    "one keydown per scripted key",
  );
  assert.equal(
    result.keyStats.trusted,
    result.keyStats.total,
    "every keydown isTrusted",
  );

  const document = result.snapshot.document;
  const validation = validateDocument(document);
  assert.ok(validation.ok, "end-state document passes the frozen schema");

  const [section, list1, list3, table, pageBreak, tail] = document.blocks;
  assert.equal(
    document.blocks.length,
    6,
    "section, 2 lists, table, pageBreak, tail paragraph",
  );

  // Section: level unchanged, children reordered [title-paragraph, p2, p1].
  assert.equal(section?.type, "section");
  if (section?.type !== "section") throw new Error("unreachable");
  assert.equal(section.level, 1, "Tab then Shift+Tab round-trips the level");
  assert.equal(section.children.length, 3);
  const [titleParagraph, second, first] = section.children;
  assert.equal(titleParagraph?.type, "paragraph");
  assert.equal(
    titleParagraph?.type === "paragraph" ? titleParagraph.text : "",
    "x第一段文本",
    "demoted section title paragraph carries the promoted text",
  );
  assert.notEqual(titleParagraph?.id, IDS.p1, "title paragraph is a NEW node");
  assert.equal(second?.id, IDS.p2);
  assert.equal(first?.id, IDS.p1, "paragraph id preserved through promote/demote/move");
  assert.equal(first?.type === "paragraph" ? first.text : "", "x第一段文本");

  // Lists: merge then split -> first list keeps [i1,i2], new list holds [i3].
  assert.equal(list1?.id, IDS.list1);
  assert.equal(
    list1?.type === "list" ? list1.items.map((entry) => entry.id).join(",") : "",
    `${IDS.i1},${IDS.i2}`,
  );
  assert.equal(list3?.type, "list");
  if (list3?.type !== "list") throw new Error("unreachable");
  assert.notEqual(list3.id, IDS.list2);
  assert.deepEqual(
    list3.items.map((entry) => entry.id),
    [IDS.i3],
  );

  // Table: row insert+delete round-trip (2 rows), column insert+delete (2 cols).
  assert.equal(table?.type, "table");
  if (table?.type !== "table") throw new Error("unreachable");
  assert.equal(table.rows.length, 2);
  assert.equal(table.columns.length, 2);
  assert.deepEqual(
    table.columns.map((column) => column.id),
    [col("c001"), col("c002")],
    "original column ids intact",
  );

  // Undo restored the pageBreak; the fork edit stands and cleared redo.
  assert.equal(
    pageBreak?.id,
    IDS.pageBreak,
    "undo really restored the deleted pageBreak",
  );
  assert.equal(tail?.id, IDS.p3);
  assert.equal(tail?.type === "paragraph" ? tail.text : "", "y收尾段落");
  assert.equal(result.snapshot.redoDepth, 0, "fork edit cleared the redo stack");
  assert.equal(
    result.snapshot.undoDepth,
    15,
    "15 committed transactions along the script",
  );
  assert.match(result.snapshot.status, /已输入/);
});

test("confirm-enter: D1 confirm phase confirms with Enter and enumerates failed assets", async () => {
  const { lines } = await runWorkspace({
    document: workspaceDocument(),
    script: [K("Enter")],
    importMeta: true,
  });
  const result = resultOf(lines);
  assert.equal(result.keyStats.trusted, 1);
  assert.equal(result.snapshot.phase, "editing");
  assert.equal(result.snapshot.confirmationOutcome, "confirmed");
  assert.equal(result.snapshot.importMeta?.failedAssets[0]?.fileName, "img2.png");
});

test("confirm-skip: D1 confirm phase is skippable with Escape", async () => {
  const { lines } = await runWorkspace({
    document: workspaceDocument(),
    script: [K("Escape")],
    importMeta: true,
  });
  const result = resultOf(lines);
  assert.equal(result.snapshot.confirmationOutcome, "skipped");
  assert.equal(result.snapshot.phase, "editing");
});

test("corrupt: unparsable document.json fails closed as corrupt, never editable", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "wenshu-a03-"));
  await mkdir(workdir, { recursive: true });
  await writeFile(join(workdir, "document.json"), "{ not json");
  const reportDir = await mkdtemp(join(tmpdir(), "wenshu-a03-report-"));
  const proc = spawnE2E({
    workdir,
    reportDir,
    extraEnv: { E2E_SCENARIO_MODE: "workspace", E2E_KEY_SCRIPT: "[]" },
  });
  try {
    const lines = await waitForReportLines(
      proc.reportPath,
      (entries) => entries.some((entry) => entry["type"] === "workspace-error"),
      60_000,
    );
    assert.match(errorOf(lines), /corrupt/);
  } finally {
    proc.child.kill("SIGKILL");
    await proc.exit;
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    await rm(reportDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("schema-invalid: schema-breaking document.json fails closed DOCUMENT_INVALID", async () => {
  const invalid = { ...workspaceDocument(), blocks: [] };
  const { lines } = await runWorkspace({ document: invalid, script: [] });
  assert.match(errorOf(lines), /DOCUMENT_INVALID/);
});

test("editing: document digest on disk matches the channel-reported sha256", async () => {
  const source = workspaceDocument();
  const workdir = await mkdtemp(join(tmpdir(), "wenshu-a03-"));
  await writeFile(join(workdir, "document.json"), JSON.stringify(source));
  const reportDir = await mkdtemp(join(tmpdir(), "wenshu-a03-report-"));
  const proc = spawnE2E({
    workdir,
    reportDir,
    extraEnv: {
      E2E_SCENARIO_MODE: "workspace",
      E2E_KEY_SCRIPT: JSON.stringify([K("ArrowDown")]),
    },
  });
  try {
    const lines = await waitForReportLines(
      proc.reportPath,
      (entries) => entries.some((entry) => entry["type"] === "workspace-result"),
      120_000,
    );
    const result = resultOf(lines);
    assert.equal(
      result.documentSha256,
      await sha256File(join(workdir, "document.json")),
      "channel reports the real on-disk digest",
    );
  } finally {
    await awaitExit(proc, 30_000);
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    await rm(reportDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
