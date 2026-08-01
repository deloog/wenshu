import Ajv2020 from "ajv/dist/2020.js";

import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import uxStatesSchema from "../schema/ux-states-1.0.0.schema.json" with { type: "json" };
import type { UxState, UxStatesDocument } from "./generated/ux-states.ts";
import statesV1_0_0 from "./states-1.0.0.json" with { type: "json" };

export type * from "./generated/ux-states.ts";

/** Current producer version; readers fail closed on any other stateVersion. */
export const UX_STATE_SCHEMA_VERSION = "1.0.0" as const;
export const SUPPORTED_UX_STATE_SCHEMA_VERSIONS = Object.freeze(["1.0.0"] as const);

export type UxStateIssueCode =
  | "UX_STATE_BUDGET_EXCEEDED"
  | "UX_STATE_DUPLICATE_ID"
  | "UX_STATE_EXTENSION_MISSING"
  | "UX_STATE_SCHEMA"
  | "UX_STATE_TRANSITION_DANGLING";

export interface UxStateIssue {
  readonly code: UxStateIssueCode;
  readonly path: string;
}

export type UxStatesValidationResult =
  | {
      readonly ok: true;
      readonly value: UxStatesDocument;
    }
  | {
      readonly ok: false;
      readonly issues: readonly UxStateIssue[];
    };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<UxStatesDocument>(uxStatesSchema);

function issue(code: UxStateIssueCode, path: string): UxStateIssue {
  return Object.freeze({ code, path });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * State ids that must carry a domain extension object. Enforced in code rather
 * than schema if/then (which degrades generated types to untyped records).
 */
const REQUIRED_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  pagination: "pagination",
  "permission-denied": "permission",
  "offline-degraded": "offline",
  "crash-recovery": "recovery",
});

/**
 * Full contract validation: hostile-input budget pre-check, JSON Schema shape,
 * then the semantic layer JSON Schema cannot express (unique ids, closed
 * transition graph, id-conditional extension presence). Never throws on data
 * shape problems; callers get issues.
 */
export function validateUxStates(input: unknown): UxStatesValidationResult {
  const inspection = inspectData(input, { maxDepth: 16, maxNodes: 10000 });
  if (!inspection.ok) {
    return {
      ok: false,
      issues: [issue("UX_STATE_BUDGET_EXCEEDED", inspection.path)],
    };
  }
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      issue("UX_STATE_SCHEMA", error.instancePath === "" ? "/" : error.instancePath),
    );
    return { ok: false, issues };
  }
  const value = input;
  const issues: UxStateIssue[] = [];
  const ids = new Set<string>();
  value.states.forEach((state, index) => {
    if (ids.has(state.id)) {
      issues.push(issue("UX_STATE_DUPLICATE_ID", `/states/${index}/id`));
    }
    ids.add(state.id);
  });
  value.states.forEach((state, index) => {
    const extensionKey = REQUIRED_EXTENSIONS[state.id];
    if (extensionKey !== undefined && !(extensionKey in state)) {
      issues.push(
        issue("UX_STATE_EXTENSION_MISSING", `/states/${index}/${extensionKey}`),
      );
    }
    state.transitions.forEach((target, transitionIndex) => {
      if (!ids.has(target)) {
        issues.push(
          issue(
            "UX_STATE_TRANSITION_DANGLING",
            `/states/${index}/transitions/${transitionIndex}`,
          ),
        );
      }
    });
  });
  if (issues.length > 0) {
    return { ok: false, issues: Object.freeze(issues) };
  }
  return { ok: true, value: cloneAndFreeze(value) };
}

function loadFrozenStates(): UxStatesDocument {
  const result = validateUxStates(statesV1_0_0);
  if (!result.ok) {
    const summary = result.issues
      .map((entry) => `${entry.code}@${entry.path}`)
      .join(", ");
    throw new Error(`Frozen ux states 1.0.0 failed self-validation: ${summary}`);
  }
  return result.value;
}

/** The frozen Alpha UX state machine (ux-spec §4, twelve rows, table order). */
export const UX_STATES: UxStatesDocument = loadFrozenStates();

export function listUxStates(): readonly UxState[] {
  return UX_STATES.states;
}

export function isUxStateId(id: string): boolean {
  return UX_STATES.states.some((state) => state.id === id);
}

export function getUxState(id: string): UxState | undefined {
  return UX_STATES.states.find((state) => state.id === id);
}

export function transitionsFrom(id: string): readonly string[] {
  return Object.freeze([...(getUxState(id)?.transitions ?? [])]);
}

export function canTransition(fromId: string, toId: string): boolean {
  if (!isUxStateId(toId)) {
    return false;
  }
  const from = getUxState(fromId);
  return from !== undefined && from.transitions.includes(toId);
}

/** BFS reachability from a start id over the frozen transition graph. */
export function reachableStateIds(startId: string): ReadonlySet<string> {
  const visited = new Set<string>();
  if (!isUxStateId(startId)) {
    return visited;
  }
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const target of transitionsFrom(current)) {
      if (!visited.has(target)) {
        queue.push(target);
      }
    }
  }
  return visited;
}

export function isUxStatesDocument(value: unknown): value is UxStatesDocument {
  return isRecord(value) && validateUxStates(value).ok;
}
