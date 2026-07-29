import type { SupportedDocument } from "@wenshu/document-model";

import type { DiffAnchor, FieldDiff } from "./contract.ts";

type Scalar = string | number | boolean | null;

interface NodeRecord {
  readonly anchor: DiffAnchor;
  readonly fields: ReadonlyMap<string, Scalar>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalarFields(
  value: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, Scalar> {
  const fields = new Map<string, Scalar>();
  for (const [key, field] of Object.entries(value)) {
    if (
      key !== "id" &&
      (typeof field === "string" ||
        typeof field === "number" ||
        typeof field === "boolean" ||
        field === null)
    ) {
      fields.set(key, field);
    }
  }
  return fields;
}

function collect(
  value: unknown,
  parentId: string | undefined,
  ancestors: readonly string[],
  siblingIndex: number,
  result: Map<string, NodeRecord>,
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collect(child, parentId, ancestors, index, result));
    return;
  }
  if (!isRecord(value)) return;
  const id = value["id"] ?? value["documentId"];
  const nodeId = typeof id === "string" ? id : undefined;
  const anchor =
    nodeId === undefined
      ? undefined
      : Object.freeze({
          nodeId,
          parentId,
          ancestorIds: Object.freeze([...ancestors]),
          siblingIndex,
        });
  if (anchor !== undefined && nodeId !== undefined) {
    result.set(nodeId, { anchor, fields: scalarFields(value) });
  }
  const nextParent = nodeId ?? parentId;
  const nextAncestors = nodeId === undefined ? ancestors : [...ancestors, nodeId];
  for (const [key, child] of Object.entries(value)) {
    if (key !== "id") collect(child, nextParent, nextAncestors, 0, result);
  }
}

function records(document: SupportedDocument): ReadonlyMap<string, NodeRecord> {
  const result = new Map<string, NodeRecord>();
  collect(document, undefined, [], 0, result);
  return result;
}

function makeDiff(
  id: string,
  kind: FieldDiff["kind"],
  anchor: DiffAnchor,
  field: string,
  before: FieldDiff["before"],
  after: FieldDiff["after"],
): FieldDiff {
  return Object.freeze({ id, kind, anchor, field, before, after });
}

/** Compares scalar fields per stable node ID; structural context is always retained. */
export function diffDocuments(
  before: SupportedDocument,
  after: SupportedDocument,
  proposalId: string,
): readonly FieldDiff[] {
  const oldNodes = records(before);
  const newNodes = records(after);
  const ids = [...new Set([...oldNodes.keys(), ...newNodes.keys()])].sort();
  const diffs: FieldDiff[] = [];
  for (const nodeId of ids) {
    const oldNode = oldNodes.get(nodeId);
    const newNode = newNodes.get(nodeId);
    if (oldNode === undefined && newNode !== undefined) {
      for (const [field, afterValue] of [...newNode.fields].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        diffs.push(
          makeDiff(
            `${proposalId}:${nodeId}:${field}`,
            "added",
            newNode.anchor,
            field,
            undefined,
            afterValue,
          ),
        );
      }
      continue;
    }
    if (oldNode !== undefined && newNode === undefined) {
      for (const [field, beforeValue] of [...oldNode.fields].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        diffs.push(
          makeDiff(
            `${proposalId}:${nodeId}:${field}`,
            "removed",
            oldNode.anchor,
            field,
            beforeValue,
            undefined,
          ),
        );
      }
      continue;
    }
    if (oldNode === undefined || newNode === undefined) continue;
    if (oldNode.anchor.parentId !== newNode.anchor.parentId) {
      diffs.push(
        makeDiff(
          `${proposalId}:${nodeId}:$parent`,
          "changed",
          newNode.anchor,
          "$parent",
          oldNode.anchor.parentId,
          newNode.anchor.parentId,
        ),
      );
    }
    const fields = [
      ...new Set([...oldNode.fields.keys(), ...newNode.fields.keys()]),
    ].sort();
    for (const field of fields) {
      const oldValue = oldNode.fields.get(field);
      const newValue = newNode.fields.get(field);
      if (oldValue !== newValue) {
        diffs.push(
          makeDiff(
            `${proposalId}:${nodeId}:${field}`,
            "changed",
            newNode.anchor,
            field,
            oldValue,
            newValue,
          ),
        );
      }
    }
  }
  return Object.freeze(diffs);
}
