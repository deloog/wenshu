import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IMPORT_FLOW_STATE_IDS,
  ImportFlowTransitionError,
  createImportFlowController,
  type ImportFlowStateId,
  type ImportFlowStateView,
} from "../src/import-flow.ts";
import { getUxState } from "../src/index.ts";

interface FrozenStateRow {
  readonly id: string;
  readonly label: string;
  readonly requiredPresentation: readonly string[];
  readonly forbiddenSemantics: readonly string[];
  readonly cancelable: boolean;
  readonly a11y: {
    readonly textEquivalent: string;
    readonly focusEntry: string;
    readonly noColorOnly: true;
  };
}

async function frozenRows(): Promise<readonly FrozenStateRow[]> {
  const raw = await readFile(
    new URL("../src/states-1.0.0.json", import.meta.url),
    "utf8",
  );
  return (JSON.parse(raw) as { states: FrozenStateRow[] }).states;
}

function stateView(view: ReturnType<ReturnType<typeof createImportFlowController>["view"]>): ImportFlowStateView {
  assert.equal(view.kind, "state");
  return view as ImportFlowStateView;
}

test("initial view is empty-project with verbatim frozen obligations", async () => {
  const rows = await frozenRows();
  const controller = createImportFlowController();
  const view = stateView(controller.view());
  const frozen = rows.find((row) => row.id === "empty-project");
  assert.ok(frozen);
  assert.equal(view.stateId, "empty-project");
  assert.deepEqual(view.requiredPresentation, frozen.requiredPresentation);
  assert.deepEqual(view.forbiddenSemantics, frozen.forbiddenSemantics);
  assert.deepEqual(view.a11y, frozen.a11y);
  assert.equal(view.cancelable, frozen.cancelable);
  assert.equal(view.label, frozen.label);
});

test("all four state views carry verbatim frozen obligations", async () => {
  const rows = await frozenRows();
  const controller = createImportFlowController();
  const views: Record<string, ImportFlowStateView> = {};
  views["empty-project"] = stateView(controller.view());
  views["importing"] = stateView(
    controller.dispatch({ type: "import-started", fileName: "draft.md" }),
  );
  views["import-partial"] = stateView(
    controller.dispatch({
      type: "import-partial",
      items: [{ fileName: "chart.svg", reasonCode: "ASSET_NOT_SELECTED", retryable: true }],
    }),
  );
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  views["permission-denied"] = stateView(
    controller.dispatch({
      type: "import-permission-denied",
      reasonCode: "HOST_PERMISSION_DENIED",
      retryable: true,
    }),
  );
  for (const id of IMPORT_FLOW_STATE_IDS) {
    const view = views[id];
    const frozen = rows.find((row) => row.id === id);
    assert.ok(view, id);
    assert.ok(frozen, id);
    assert.deepEqual(view.requiredPresentation, frozen.requiredPresentation, id);
    assert.deepEqual(view.forbiddenSemantics, frozen.forbiddenSemantics, id);
    assert.deepEqual(view.a11y, frozen.a11y, id);
    assert.equal(view.cancelable, frozen.cancelable, id);
    // Verbatim means exactly what the main entry's Ajv-validated state says.
    const viaAjv = getUxState(id);
    assert.ok(viaAjv);
    assert.deepEqual(view.requiredPresentation, viaAjv.requiredPresentation, id);
    assert.deepEqual(view.forbiddenSemantics, viaAjv.forbiddenSemantics, id);
  }
});

test("happy path: empty-project → importing → project view (non-state-machine)", () => {
  const controller = createImportFlowController();
  const importing = stateView(
    controller.dispatch({ type: "import-started", fileName: "报告.md" }),
  );
  assert.equal(importing.stateId, "importing");
  assert.equal(importing.fileName, "报告.md");
  assert.equal(importing.cancelable, true);
  const progressed = stateView(
    controller.dispatch({
      type: "import-progress",
      progress: { phase: "解析正文", percent: 40 },
    }),
  );
  assert.deepEqual(progressed.progress, { phase: "解析正文", percent: 40 });
  const done = controller.dispatch({ type: "import-succeeded" });
  assert.deepEqual(done, { kind: "project-view", cause: "import-succeeded" });
});

test("illegal transitions throw ImportFlowTransitionError (fail-closed)", () => {
  const controller = createImportFlowController();
  // empty-project has no direct transition to import-partial/permission-denied.
  assert.throws(
    () =>
      controller.dispatch({
        type: "import-partial",
        items: [{ fileName: "a.svg", reasonCode: "X", retryable: true }],
      }),
    ImportFlowTransitionError,
  );
  assert.throws(
    () =>
      controller.dispatch({
        type: "import-permission-denied",
        reasonCode: "HOST_PERMISSION_DENIED",
        retryable: true,
      }),
    ImportFlowTransitionError,
  );
  assert.throws(() => controller.dispatch({ type: "import-succeeded" }), ImportFlowTransitionError);
  assert.throws(() => controller.dispatch({ type: "import-cancelled" }), ImportFlowTransitionError);
  assert.throws(
    () => controller.dispatch({ type: "return-to-project" }),
    ImportFlowTransitionError,
  );
  // Failure must not move the position.
  assert.equal(stateView(controller.view()).stateId, "empty-project");
});

test("import-partial requires per-item failures; empty items would swallow results", () => {
  const controller = createImportFlowController();
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  assert.throws(
    () => controller.dispatch({ type: "import-partial", items: [] }),
    ImportFlowTransitionError,
  );
  const view = stateView(
    controller.dispatch({
      type: "import-partial",
      items: [
        { fileName: "chart.svg", reasonCode: "ASSET_NOT_SELECTED", retryable: true },
        { fileName: "photo.png", reasonCode: "ASSET_UNREADABLE", retryable: true },
      ],
    }),
  );
  assert.equal(view.stateId, "import-partial");
  assert.equal(view.items?.length, 2);
  assert.deepEqual(view.forbiddenSemantics, ["不整体吞掉结果"]);
});

test("retry from import-partial and permission-denied re-enters importing legally", () => {
  const controller = createImportFlowController();
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  controller.dispatch({
    type: "import-partial",
    items: [{ fileName: "a.svg", reasonCode: "X", retryable: true }],
  });
  assert.equal(
    stateView(controller.dispatch({ type: "import-started", fileName: "draft.md" }))
      .stateId,
    "importing",
  );
  controller.dispatch({
    type: "import-permission-denied",
    reasonCode: "HOST_PERMISSION_DENIED",
    retryable: true,
  });
  assert.equal(
    stateView(controller.dispatch({ type: "import-started", fileName: "draft.md" }))
      .stateId,
    "importing",
  );
});

test("permission-denied view carries the real code, retryable flag and fallback note", () => {
  const controller = createImportFlowController();
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  const view = stateView(
    controller.dispatch({
      type: "import-permission-denied",
      reasonCode: "HOST_UNSUPPORTED",
      retryable: false,
      fallbackNote: "manual_file_picker/BROWSER_HOST_NO_IMPORT_PIPELINE",
    }),
  );
  assert.equal(view.stateId, "permission-denied");
  assert.equal(view.reasonCode, "HOST_UNSUPPORTED");
  assert.equal(view.retryable, false);
  assert.equal(view.fallbackNote, "manual_file_picker/BROWSER_HOST_NO_IMPORT_PIPELINE");
  // 不循环弹窗 travels verbatim with the view.
  assert.deepEqual(view.forbiddenSemantics, ["不循环弹窗"]);
});

test("cancel lands in project view as cancelled, never disguised as failure", () => {
  const controller = createImportFlowController();
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  const view = controller.dispatch({ type: "import-cancelled" });
  assert.deepEqual(view, { kind: "project-view", cause: "import-cancelled" });
  assert.equal("reasonCode" in view, false);
});

test("whole-import failure surfaces the real code, not a fake state", () => {
  const controller = createImportFlowController();
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  const view = controller.dispatch({
    type: "import-failed",
    reasonCode: "MARKDOWN_PARSE_FAILURE",
  });
  assert.deepEqual(view, {
    kind: "project-view",
    cause: "import-failed",
    reasonCode: "MARKDOWN_PARSE_FAILURE",
  });
});

test("project-opened and return-to-project produce the project view", () => {
  const controller = createImportFlowController();
  assert.deepEqual(
    controller.dispatch({ type: "project-opened", projectName: "季度报告" }),
    { kind: "project-view", cause: "project-opened", projectName: "季度报告" },
  );
  // A new import may start from a ready project (anchored at empty-project).
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  controller.dispatch({
    type: "import-partial",
    items: [{ fileName: "a.svg", reasonCode: "X", retryable: true }],
  });
  assert.deepEqual(controller.dispatch({ type: "return-to-project" }), {
    kind: "project-view",
    cause: "returned",
  });
  // Opening another project while importing is illegal.
  const busy = createImportFlowController();
  busy.dispatch({ type: "import-started", fileName: "draft.md" });
  assert.throws(
    () => busy.dispatch({ type: "project-opened", projectName: "x" }),
    ImportFlowTransitionError,
  );
});

test("progress outside 0..100 is rejected fail-closed", () => {
  const controller = createImportFlowController();
  controller.dispatch({ type: "import-started", fileName: "draft.md" });
  assert.throws(
    () =>
      controller.dispatch({
        type: "import-progress",
        progress: { phase: "x", percent: 101 },
      }),
    ImportFlowTransitionError,
  );
});

test("the four import-flow state ids exist in the frozen machine (no 13th state)", () => {
  for (const id of IMPORT_FLOW_STATE_IDS) {
    assert.ok(getUxState(id), id);
  }
  assert.equal(getUxState("project-ready" as ImportFlowStateId), undefined);
});
