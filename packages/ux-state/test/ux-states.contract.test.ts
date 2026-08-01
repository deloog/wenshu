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
