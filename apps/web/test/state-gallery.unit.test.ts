/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";

import { UX_STATES, listUxStates } from "@wenshu/ux-state";

import {
  buildScreenFor,
  buildStateScreens,
  extensionEntries,
} from "../src/prototype/state-gallery.ts";

const EXPECTED_ORDER = [
  "empty-project",
  "importing",
  "import-partial",
  "ai-processing",
  "ai-result",
  "pagination",
  "page-issues",
  "save-result",
  "pre-export",
  "offline-degraded",
  "permission-denied",
  "crash-recovery",
] as const;

test("gallery renders exactly one screen per frozen state, in table order", () => {
  const screens = buildStateScreens();
  assert.equal(screens.length, 12);
  assert.deepEqual(
    screens.map((screen) => screen.stateId),
    EXPECTED_ORDER,
  );
  assert.deepEqual(
    screens.map((screen) => screen.uxSpecRow),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
});

test("acceptance line: every contract obligation is present in its screen", () => {
  // The mechanical form of "12 rows each have an acceptable prototype":
  // requiredPresentation and forbiddenSemantics are carried VERBATIM from the
  // frozen contract into the view model; dropping one turns this red.
  const screens = buildStateScreens();
  for (const state of listUxStates()) {
    const screen = screens.find((entry) => entry.stateId === state.id);
    assert.ok(screen !== undefined, state.id);
    assert.deepEqual(screen.requiredItems, state.requiredPresentation, state.id);
    assert.deepEqual(screen.forbiddenNotes, state.forbiddenSemantics, state.id);
    assert.equal(screen.cancelable, state.cancelable, state.id);
    assert.equal(screen.textEquivalent, state.a11y.textEquivalent, state.id);
    assert.equal(screen.focusEntry, state.a11y.focusEntry, state.id);
    assert.ok(screen.textEquivalent.length > 0, state.id);
  }
});

test("screen transitions resolve to known state labels", () => {
  for (const screen of buildStateScreens()) {
    for (const target of screen.transitions) {
      assert.equal(
        UX_STATES.states.some((state) => state.id === target.id),
        true,
      );
      assert.ok(target.label.length > 0);
      assert.notEqual(target.label, target.id);
    }
  }
});

test("pagination screen shows incremental-only semantics, never full repagination", () => {
  const screen = buildScreenFor("pagination");
  assert.ok(screen !== undefined);
  const names = screen.extensions.map((entry) => entry.name);
  const values = screen.extensions.map((entry) => entry.value);
  assert.ok(names.includes("分页·repaginationScope"));
  assert.ok(values.includes("incremental"));
  assert.ok(names.includes("分页·stalePreviewRetained"));
  assert.equal(
    screen.extensions.some((entry) => entry.name.includes("fullRepagination")),
    false,
  );
  assert.equal(
    screen.extensions.some((entry) => entry.value.includes("fullRepagination")),
    false,
  );
});

test("crash-recovery screen carries checkpoint / loss / copy obligations", () => {
  const screen = buildScreenFor("crash-recovery");
  assert.ok(screen !== undefined);
  assert.deepEqual(screen.requiredItems, [
    "恢复到哪个检查点",
    "可能丢失什么",
    "是否另存恢复副本",
  ]);
  const names = screen.extensions.map((entry) => entry.name);
  assert.ok(names.includes("恢复·checkpoint"));
  assert.ok(names.includes("恢复·potentialLoss"));
  assert.ok(names.includes("恢复·recoveryCopy"));
});

test("permission-denied screen shows explicit degradation and no retry loop", () => {
  const screen = buildScreenFor("permission-denied");
  assert.ok(screen !== undefined);
  assert.deepEqual(screen.forbiddenNotes, ["不循环弹窗"]);
  const names = screen.extensions.map((entry) => entry.name);
  assert.ok(names.includes("权限·degradationOptions"));
  assert.ok(names.includes("权限·noRetryLoop"));
});

test("offline screen keeps the four local capabilities", () => {
  const screen = buildScreenFor("offline-degraded");
  assert.ok(screen !== undefined);
  const capabilities = screen.extensions.find(
    (entry) => entry.name === "离线·localCapabilitiesIntact",
  );
  assert.ok(capabilities !== undefined);
  assert.deepEqual(capabilities.value.split("、").sort(), [
    "导出",
    "排版",
    "检查",
    "编辑",
  ]);
});

test("states without extensions produce no extension entries", () => {
  const state = UX_STATES.states.find((entry) => entry.id === "empty-project");
  assert.ok(state !== undefined);
  assert.deepEqual(extensionEntries(state), []);
});
