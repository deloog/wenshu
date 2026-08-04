/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";

import { IMPORT_FLOW_STATE_IDS } from "@wenshu/ux-state/import-flow";

import type { BridgeTerminal, FlowBridge } from "../src/flow/bridge.ts";
import { createBrowserFlowBridge } from "../src/flow/bridge.ts";
import { createProjectFlow } from "../src/flow/session.ts";
import { buildFlowScreen } from "../src/flow/view-model.ts";
import { createBrowserHost } from "../src/host.ts";

function fakeBridge(terminals: {
  create?: BridgeTerminal;
  open?: BridgeTerminal;
  import?: BridgeTerminal;
}): FlowBridge {
  return {
    createProject: () => Promise.resolve(terminals.create ?? { kind: "cancelled" }),
    openProject: () => Promise.resolve(terminals.open ?? { kind: "cancelled" }),
    importMarkdown: () => Promise.resolve(terminals.import ?? { kind: "cancelled" }),
  };
}

test("initial screen is empty-project with verbatim frozen obligations", () => {
  const flow = createProjectFlow(fakeBridge({}));
  const screen = flow.screen();
  assert.equal(screen.kind, "state");
  assert.deepEqual(screen.requiredItems, ["支持的输入", "示例", "下一步"]);
  assert.deepEqual(screen.forbiddenNotes, ["不出现无意义空白编辑器"]);
  assert.deepEqual(screen.actions, ["new-project", "open-project", "import-markdown"]);
});

test("new project success lands in the project view with the chosen name", async () => {
  const flow = createProjectFlow(
    fakeBridge({ create: { kind: "success", projectName: "季度报告" } }),
  );
  const screen = await flow.newProject("季度报告");
  assert.equal(screen.kind, "project-view");
  assert.match(screen.heading, /季度报告/u);
  assert.deepEqual(screen.actions, ["new-project", "open-project", "import-markdown"]);
});

test("denied directory selection stays at empty-project with a notice (no state lie)", async () => {
  const flow = createProjectFlow(
    fakeBridge({
      create: { kind: "failure", code: "HOST_PERMISSION_DENIED", retryable: true },
    }),
  );
  const screen = await flow.newProject("x");
  assert.equal(screen.kind, "state");
  assert.equal(screen.heading.includes("empty-project"), true);
  assert.match(screen.notice ?? "", /HOST_PERMISSION_DENIED/u);
});

test("import unsupported degrades to permission-denied with fallback and no retry button", async () => {
  const flow = createProjectFlow(
    fakeBridge({
      import: {
        kind: "failure",
        code: "HOST_UNSUPPORTED",
        retryable: false,
        fallbackNote: "manual_file_picker/BROWSER_HOST_NO_IMPORT_PIPELINE",
      },
    }),
  );
  const screen = await flow.importMarkdown();
  assert.equal(screen.kind, "state");
  assert.equal(screen.heading.includes("permission-denied"), true);
  // Verbatim frozen obligations for permission-denied.
  assert.deepEqual(screen.requiredItems, [
    "为什么需要",
    "当前可做什么",
    "如何重新授权",
  ]);
  assert.deepEqual(screen.forbiddenNotes, ["不循环弹窗"]);
  // One failed call stops the flow: no retry affordance, only return.
  assert.deepEqual(screen.actions, ["return-to-project"]);
  assert.ok(screen.detailLines.some((line) => line.includes("HOST_UNSUPPORTED")));
  assert.ok(
    screen.detailLines.some((line) =>
      line.includes("manual_file_picker/BROWSER_HOST_NO_IMPORT_PIPELINE"),
    ),
  );
  // The only way forward is the explicit return action.
  const back = flow.returnToProject();
  assert.equal(back.kind, "project-view");
});

test("retryable permission denial exposes a single explicit retry action", async () => {
  const flow = createProjectFlow(
    fakeBridge({
      import: { kind: "failure", code: "HOST_PERMISSION_DENIED", retryable: true },
    }),
  );
  const screen = await flow.importMarkdown();
  assert.deepEqual(screen.actions, ["retry-import", "return-to-project"]);
});

test("partial import enumerates per-item failures and never swallows results", async () => {
  const flow = createProjectFlow(
    fakeBridge({
      import: {
        kind: "partial",
        items: [
          { fileName: "chart.svg", reasonCode: "ASSET_NOT_SELECTED", retryable: true },
          { fileName: "photo.png", reasonCode: "ASSET_UNREADABLE", retryable: true },
        ],
      },
    }),
  );
  const screen = await flow.importMarkdown();
  assert.equal(screen.kind, "state");
  assert.equal(screen.heading.includes("import-partial"), true);
  assert.deepEqual(screen.requiredItems, ["成功内容", "失败附件", "原因", "可重试项"]);
  assert.deepEqual(screen.forbiddenNotes, ["不整体吞掉结果"]);
  assert.equal(screen.items.length, 2);
  assert.deepEqual(
    screen.items.map((item) => item.fileName),
    ["chart.svg", "photo.png"],
  );
  assert.deepEqual(screen.actions, ["retry-import", "return-to-project"]);
});

test("non-denial failure surfaces as honest whole-import failure", async () => {
  const flow = createProjectFlow(
    fakeBridge({
      import: { kind: "failure", code: "HOST_IO_FAILURE", retryable: true },
    }),
  );
  // Non-denial failure code → honest whole-import failure, not a fake state.
  const screen = await flow.importMarkdown();
  assert.equal(screen.kind, "project-view");
  assert.match(screen.heading, /导入失败（HOST_IO_FAILURE）/u);
});

test("import success returns to the project view (no invented 13th state)", async () => {
  const flow = createProjectFlow(
    fakeBridge({ import: { kind: "success", fileName: "draft.md" } }),
  );
  const screen = await flow.importMarkdown();
  assert.equal(screen.kind, "project-view");
  assert.match(screen.heading, /导入完成/u);
});

test("cancelled import is reported as cancelled, never as failure", async () => {
  const flow = createProjectFlow(fakeBridge({ import: { kind: "cancelled" } }));
  const screen = await flow.importMarkdown();
  assert.equal(screen.kind, "project-view");
  assert.match(screen.heading, /已取消/u);
  assert.equal(/^导入失败/u.test(screen.heading), false);
});

test("browser Host end-to-end: import Markdown degrades honestly via file.import.select", async () => {
  const bridge = createBrowserFlowBridge(createBrowserHost());
  const flow = createProjectFlow(bridge);
  const screen = await flow.importMarkdown();
  assert.equal(screen.kind, "state");
  assert.equal(screen.heading.includes("permission-denied"), true);
  assert.ok(screen.detailLines.some((line) => line.includes("HOST_UNSUPPORTED")));
  assert.deepEqual(screen.actions, ["return-to-project"]);
});

test("view-model passes frozen obligations through verbatim for all four states", () => {
  // Spot-check the contract anchor ids are exactly the frozen four.
  assert.deepEqual(IMPORT_FLOW_STATE_IDS, [
    "empty-project",
    "importing",
    "import-partial",
    "permission-denied",
  ]);
  const screen = buildFlowScreen({
    kind: "state",
    stateId: "importing",
    label: "导入中",
    requiredPresentation: ["文件名", "阶段", "进度", "取消", "原文件只读"],
    forbiddenSemantics: [],
    a11y: {
      textEquivalent: "t",
      focusEntry: "f",
      noColorOnly: true,
    },
    cancelable: true,
    fileName: "a.md",
    progress: { phase: "解析", percent: 10 },
  });
  assert.deepEqual(screen.requiredItems, [
    "文件名",
    "阶段",
    "进度",
    "取消",
    "原文件只读",
  ]);
  assert.deepEqual(screen.actions, ["cancel-import"]);
  assert.ok(screen.detailLines.some((line) => line.includes("10%")));
});
