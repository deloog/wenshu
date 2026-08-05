import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import uxStatesSchema from "../schema/ux-states-1.0.0.schema.json" with { type: "json" };
import {
  SUPPORTED_UX_STATE_SCHEMA_VERSIONS,
  UX_STATE_SCHEMA_VERSION,
  UX_STATES,
  canTransition,
  getUxState,
  isUxStateId,
  listUxStates,
  reachableStateIds,
  transitionsFrom,
  validateUxStates,
} from "../src/index.ts";

/** Canonical 12 states in docs/ux-spec.md §4 table order. */
const EXPECTED_STATE_IDS = [
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

const ROADMAP_EVIDENCE_ROWS = [
  "importing",
  "import-partial",
  "ai-processing",
  "pagination",
  "offline-degraded",
  "permission-denied",
  "crash-recovery",
] as const;

const UX_SPEC_ONLY_ROWS = [
  "empty-project",
  "ai-result",
  "page-issues",
  "pre-export",
] as const;

function cloneStates(): unknown {
  return structuredClone({
    stateVersion: UX_STATE_SCHEMA_VERSION,
    states: structuredClone(UX_STATES.states),
  });
}

function mutateCanonical(mutator: (document: { states: unknown[] }) => void): unknown {
  const candidate = structuredClone({
    stateVersion: UX_STATE_SCHEMA_VERSION,
    states: structuredClone(UX_STATES.states),
  }) as { states: unknown[] };
  mutator(candidate);
  return candidate;
}

test("frozen document: exactly the 12 ux-spec §4 rows, in table order", () => {
  assert.equal(listUxStates().length, 12);
  assert.deepEqual(
    listUxStates().map((state) => state.id),
    EXPECTED_STATE_IDS,
  );
  assert.deepEqual(
    listUxStates().map((state) => state.uxSpecRow),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
});

test("evidence-source accounting: 7 roadmap rows + 4 ux-spec rows + 1 dual", () => {
  const bySource = new Map<string, string[]>();
  for (const state of listUxStates()) {
    const bucket = bySource.get(state.evidenceSource) ?? [];
    bucket.push(state.id);
    bySource.set(state.evidenceSource, bucket);
  }
  assert.deepEqual(bySource.get("roadmap-completion-evidence"), [
    ...ROADMAP_EVIDENCE_ROWS,
  ]);
  assert.deepEqual(bySource.get("ux-spec-must-present"), [...UX_SPEC_ONLY_ROWS]);
  assert.deepEqual(bySource.get("dual"), ["save-result"]);
});

test("every state carries non-empty presentation and a11y obligations", () => {
  for (const state of listUxStates()) {
    assert.ok(state.requiredPresentation.length >= 1, state.id);
    for (const entry of state.requiredPresentation) {
      assert.ok(entry.length > 0, state.id);
    }
    assert.ok(state.a11y.textEquivalent.length > 0, state.id);
    assert.ok(state.a11y.focusEntry.length > 0, state.id);
    assert.equal(state.a11y.noColorOnly, true, state.id);
  }
});

test("pinned content: crash-recovery row 12 verbatim obligations (PB-12 N3 input)", () => {
  const state = getUxState("crash-recovery");
  assert.ok(state !== undefined);
  assert.deepEqual(state.requiredPresentation, [
    "恢复到哪个检查点",
    "可能丢失什么",
    "是否另存恢复副本",
  ]);
  assert.equal(state.recovery?.checkpoint.includes("上次成功保存"), true);
  assert.equal(state.recovery?.potentialLoss.length, 14);
  assert.equal(state.recovery?.recoveryCopy, true);
});

test("pinned content: pagination is incremental-only (D3)", () => {
  const state = getUxState("pagination");
  assert.ok(state !== undefined);
  assert.equal(state.pagination?.repaginationScope, "incremental");
  assert.equal(state.pagination?.stalePreviewRetained, true);
  assert.equal(state.pagination?.cancelable, true);
  assert.ok(state.pagination?.updatedPageRange !== undefined);
});

test("pinned content: permission-denied explicit degradation, no retry loop", () => {
  const state = getUxState("permission-denied");
  assert.ok(state !== undefined);
  assert.ok((state.permission?.degradationOptions.length ?? 0) >= 1);
  assert.ok((state.permission?.availableActions.length ?? 0) >= 1);
  assert.equal(state.permission?.noRetryLoop, true);
  assert.deepEqual(state.forbiddenSemantics, ["不循环弹窗"]);
});

test("pinned content: offline keeps all four local capabilities intact", () => {
  const state = getUxState("offline-degraded");
  assert.ok(state !== undefined);
  assert.deepEqual(
    [...(state.offline?.localCapabilitiesIntact ?? [])].sort(),
    ["导出", "排版", "检查", "编辑"].sort(),
  );
});

test("forbiddenSemantics pinned verbatim for all 12 states (red lines cannot be silently emptied)", () => {
  // MINOR-1 guard: the six states WITH prohibitions are pinned to their exact
  // ux-spec §4 '不得' clauses; the six WITHOUT are pinned as empty (faithful
  // anchoring — those rows have no prohibition). Clearing ai-result's entry
  // (i.e. silently dropping "未接受不改正式内容") turns this red.
  const expected: Readonly<Record<string, readonly string[]>> = Object.freeze({
    "empty-project": Object.freeze(["不出现无意义空白编辑器"]),
    importing: Object.freeze([]),
    "import-partial": Object.freeze(["不整体吞掉结果"]),
    "ai-processing": Object.freeze([]),
    "ai-result": Object.freeze(["未接受不改正式内容"]),
    pagination: Object.freeze([]),
    "page-issues": Object.freeze(["阻断项未处理不得默认导出正式版"]),
    "save-result": Object.freeze(["失败不假装已保存"]),
    "pre-export": Object.freeze([]),
    "offline-degraded": Object.freeze([]),
    "permission-denied": Object.freeze(["不循环弹窗"]),
    "crash-recovery": Object.freeze([]),
  });
  assert.equal(Object.keys(expected).length, 12);
  const withProhibitions = Object.values(expected).filter(
    (entries) => entries.length > 0,
  );
  assert.equal(withProhibitions.length, 6);
  for (const state of listUxStates()) {
    assert.deepEqual(state.forbiddenSemantics, expected[state.id], state.id);
  }
});

test("pinned content: all 12 states' user-visible fields verbatim (A-01 MINOR-3)", () => {
  // A-01 MINOR-3 remediation (owner ruling 2026-08-05): every user-visible
  // field of the frozen 1.0.0 document is pinned to a hardcoded literal here,
  // in the contract test layer only — no copies in apps/web or scenario tests
  // (a consumer-side copy would become a second source of truth, the drift
  // A-01-followups #4 exists to prevent). empty-project and crash-recovery
  // requiredPresentation were already pinned above; they are repeated so each
  // of the 12 x 5 cells lives in exactly one literal table. Mutating any cell
  // in src/states-1.0.0.json turns this test red (60-cell mutation matrix:
  // docs/audits/A-01-minor3-remediation.md).
  type Pin = { l: string; rp: readonly string[]; te: string; fe: string; c: boolean };
  const pinned: Readonly<Record<string, Pin>> = Object.freeze({
    "empty-project": {
      l: "初次/空项目",
      rp: ["支持的输入", "示例", "下一步"],
      te: "空项目引导以文字列出支持的输入、示例与下一步",
      fe: "焦点落在「下一步」主操作",
      c: false,
    },
    importing: {
      l: "导入中",
      rp: ["文件名", "阶段", "进度", "取消", "原文件只读"],
      te: "导入进度以文字百分比与阶段名表达，不靠进度条颜色",
      fe: "焦点落在「取消」按钮",
      c: true,
    },
    "import-partial": {
      l: "导入部分成功",
      rp: ["成功内容", "失败附件", "原因", "可重试项"],
      te: "成功与失败条目均以文字清单列出，失败原因可读",
      fe: "焦点落在第一个可重试项",
      c: false,
    },
    "ai-processing": {
      l: "AI 处理中",
      rp: ["使用的模型/材料范围", "可取消", "预计费用或 BYOK 状态"],
      te: "处理阶段以文字说明当前动作与所用材料范围",
      fe: "焦点落在「取消」按钮",
      c: true,
    },
    "ai-result": {
      l: "AI 结果",
      rp: ["变更范围", "diff", "出处", "accept/reject"],
      te: "diff 增删以文字标记（新增/删除）而非仅红绿着色",
      fe: "焦点落在第一处 diff 裁决控件",
      c: false,
    },
    pagination: {
      l: "分页中",
      rp: ["当前阶段", "可取消", "旧预览保留到新结果可用"],
      te: "分页阶段与进度以文字表达，旧预览保留时有文字提示",
      fe: "焦点落在「取消」按钮",
      c: true,
    },
    "page-issues": {
      l: "页面有问题",
      rp: ["类型", "严重度", "页码", "定位", "建议", "允许的人工豁免"],
      te: "问题严重度以文字分级（阻断交付/建议修复/信息），不仅靠颜色",
      fe: "焦点落在第一条阻断项的定位链接",
      c: false,
    },
    "save-result": {
      l: "保存成功/失败",
      rp: ["明确保存位置和版本"],
      te: "保存结果以文字明确成功或失败及保存位置与版本",
      fe: "失败时焦点落在重试/诊断入口",
      c: false,
    },
    "pre-export": {
      l: "导出前",
      rp: ["格式承诺", "字体/引用/页面检查结果", "目标路径和覆盖风险"],
      te: "各格式质量承诺与检查结果以文字列出",
      fe: "焦点落在格式选择控件",
      c: false,
    },
    "offline-degraded": {
      l: "离线/模型不可用",
      rp: ["本地编辑、排版、检查和导出继续可用", "AI 功能解释降级"],
      te: "降级状态以文字说明哪些能力可用、AI 如何降级",
      fe: "焦点落在降级说明文本",
      c: false,
    },
    "permission-denied": {
      l: "权限拒绝",
      rp: ["为什么需要", "当前可做什么", "如何重新授权"],
      te: "权限需求原因与可降级路径以文字说明",
      fe: "焦点落在「如何重新授权」说明（不自动重弹授权框）",
      c: false,
    },
    "crash-recovery": {
      l: "崩溃恢复",
      rp: ["恢复到哪个检查点", "可能丢失什么", "是否另存恢复副本"],
      te: "恢复检查点与丢失范围以文字明确说明",
      fe: "焦点落在「恢复/另存副本」选择控件",
      c: false,
    },
  });
  assert.equal(Object.keys(pinned).length, 12);
  for (const state of listUxStates()) {
    const pin = pinned[state.id];
    assert.ok(pin !== undefined, state.id);
    assert.equal(state.label, pin.l, state.id);
    assert.deepEqual(state.requiredPresentation, pin.rp, state.id);
    assert.equal(state.a11y.textEquivalent, pin.te, state.id);
    assert.equal(state.a11y.focusEntry, pin.fe, state.id);
    assert.equal(state.cancelable, pin.c, state.id);
  }
});

test("transition graph: closed, no self-loops, all states reachable from empty-project", () => {
  for (const state of listUxStates()) {
    for (const target of state.transitions) {
      assert.equal(isUxStateId(target), true, `${state.id} -> ${target}`);
      assert.notEqual(target, state.id);
    }
  }
  const reachable = reachableStateIds("empty-project");
  assert.equal(reachable.size, 12);
  for (const id of EXPECTED_STATE_IDS) {
    assert.equal(reachable.has(id), true, id);
  }
});

test("canTransition: legal and illegal moves (counter-examples)", () => {
  assert.equal(canTransition("empty-project", "importing"), true);
  assert.equal(canTransition("pagination", "page-issues"), true);
  assert.equal(canTransition("crash-recovery", "empty-project"), true);
  assert.equal(canTransition("empty-project", "pre-export"), false);
  assert.equal(canTransition("pagination", "ai-result"), false);
  assert.equal(canTransition("empty-project", "nonexistent"), false);
  assert.equal(canTransition("nonexistent", "importing"), false);
  assert.deepEqual(transitionsFrom("nonexistent"), []);
});

test("frozen document is deeply immutable", () => {
  assert.equal(Object.isFrozen(UX_STATES), true);
  assert.equal(Object.isFrozen(UX_STATES.states), true);
  assert.equal(Object.isFrozen(UX_STATES.states[0]), true);
  assert.equal(Object.isFrozen(UX_STATES.states[0]?.requiredPresentation), true);
});

test("validator accepts the canonical document and order permutations", () => {
  const canonical = validateUxStates(cloneStates());
  assert.equal(canonical.ok, true);
  const reversed = mutateCanonical((document) => {
    document.states.reverse();
  });
  assert.equal(validateUxStates(reversed).ok, true);
});

test("version fail-closed: unknown and future stateVersion rejected", () => {
  for (const version of ["0.9.0", "1.0.1", "2.0.0", ""]) {
    const candidate = structuredClone(cloneStates()) as { stateVersion: string };
    candidate.stateVersion = version;
    const result = validateUxStates(candidate);
    assert.equal(result.ok, false, version);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "UX_STATE_SCHEMA");
    }
  }
  assert.deepEqual([...SUPPORTED_UX_STATE_SCHEMA_VERSIONS], ["1.0.0"]);
});

test("invalid: full-repagination field is contract-level forbidden (D3)", () => {
  const candidate = mutateCanonical(() => {}) as {
    states: { id: string; pagination?: Record<string, unknown> }[];
  };
  const pagination = candidate.states.find((state) => state.id === "pagination");
  assert.ok(pagination?.pagination !== undefined);
  pagination.pagination["fullRepagination"] = true;
  const result = validateUxStates(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.issues.some(
        (issueEntry) =>
          issueEntry.code === "UX_STATE_SCHEMA" &&
          issueEntry.path.startsWith("/states/5/pagination"),
      ),
      true,
    );
  }
});

test("invalid: stalePreviewRetained flipped to false is rejected (const guard)", () => {
  const candidate = mutateCanonical(() => {}) as {
    states: { id: string; pagination?: { stalePreviewRetained: boolean } }[];
  };
  const pagination = candidate.states.find((state) => state.id === "pagination");
  assert.ok(pagination?.pagination !== undefined);
  pagination.pagination.stalePreviewRetained = false;
  const result = validateUxStates(candidate);
  assert.equal(result.ok, false);
});

test("presentation entries are content-pinned (schema minItems alone is not the guard)", () => {
  // Popping to 2 entries still satisfies minItems 1: the schema layer alone
  // cannot pin presentation content. The frozen-document pins above are the
  // actual guard; mutating the source file turns them red.
  const candidate = mutateCanonical(() => {}) as {
    states: { requiredPresentation: string[] }[];
  };
  candidate.states[0]?.requiredPresentation.pop();
  const result = validateUxStates(candidate);
  assert.equal(result.ok, true);
  assert.deepEqual(UX_STATES.states[0]?.requiredPresentation, [
    "支持的输入",
    "示例",
    "下一步",
  ]);
});

test("invalid: dangling transition target", () => {
  const candidate = mutateCanonical(() => {}) as {
    states: { transitions: string[] }[];
  };
  candidate.states[0]?.transitions.push("ghost-state");
  const result = validateUxStates(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issueEntry) => issueEntry.code),
      ["UX_STATE_TRANSITION_DANGLING"],
    );
    assert.equal(result.issues[0]?.path, "/states/0/transitions/2");
  }
});

test("invalid: duplicate state id", () => {
  const candidate = mutateCanonical(() => {}) as {
    states: { id: string }[];
  };
  const first = candidate.states[0];
  const second = candidate.states[1];
  assert.ok(first !== undefined && second !== undefined);
  second.id = first.id;
  const result = validateUxStates(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.issues.some((issueEntry) => issueEntry.code === "UX_STATE_DUPLICATE_ID"),
      true,
    );
  }
});

test("invalid: extension required by state id is missing", () => {
  const candidate = mutateCanonical(() => {}) as {
    states: { id: string; pagination?: unknown }[];
  };
  const pagination = candidate.states.find((state) => state.id === "pagination");
  assert.ok(pagination !== undefined);
  delete pagination.pagination;
  const result = validateUxStates(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issueEntry) => `${issueEntry.code}@${issueEntry.path}`),
      ["UX_STATE_EXTENSION_MISSING@/states/5/pagination"],
    );
  }
});

test("invalid: wrong state count (11 or 13) rejected by schema", () => {
  const eleven = mutateCanonical((document) => {
    document.states.pop();
  });
  assert.equal(validateUxStates(eleven).ok, false);
  const thirteen = mutateCanonical((document) => {
    document.states.push(structuredClone(document.states[0]));
  });
  assert.equal(validateUxStates(thirteen).ok, false);
});

test("invalid: color-only a11y rejected (noColorOnly const)", () => {
  const candidate = mutateCanonical(() => {}) as {
    states: { a11y: { noColorOnly: boolean } }[];
  };
  const first = candidate.states[0];
  assert.ok(first !== undefined);
  first.a11y.noColorOnly = false;
  assert.equal(validateUxStates(candidate).ok, false);
});

test("schema regression guard: incremental-only and 12-row bounds stay pinned", () => {
  const schemaText = JSON.stringify(uxStatesSchema);
  assert.equal(schemaText.includes("fullRepagination"), true); // banned: property schema false
  const states = uxStatesSchema.properties.states;
  assert.equal(states.minItems, 12);
  assert.equal(states.maxItems, 12);
  const paginationDef = uxStatesSchema.$defs.paginationExtension;
  assert.equal(paginationDef.additionalProperties, false);
  assert.equal(paginationDef.properties.fullRepagination, false);
  assert.equal(paginationDef.properties.repaginationScope.const, "incremental");
  const a11yDef = uxStatesSchema.$defs.a11y;
  assert.equal(a11yDef.properties.noColorOnly.const, true);
});

test("frozen source file on disk matches the loaded document", async () => {
  const onDisk = JSON.parse(
    await readFile(new URL("../src/states-1.0.0.json", import.meta.url), "utf8"),
  ) as unknown;
  assert.deepEqual(UX_STATES, onDisk);
});
