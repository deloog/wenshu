import assert from "node:assert/strict";
import test from "node:test";

import { SemanticAuditTrail } from "../src/index.ts";

const hash = (char: string): string => char.repeat(64);
const model = {
  provider: "test" as const,
  model: "tokenizer",
  invocation_id: "inv_00000000000000000000000000000001",
};
const proposal = { diffs: [{ nodeId: "node_00000000000000000000000000000001" }] };

test("important AI decisions preserve diff node provenance without storing field values", () => {
  const trail = new SemanticAuditTrail();
  const event = trail.recordAiDecision({
    event_id: "audit_00000000000000000000000000000001",
    project_id: "prj_00000000000000000000000000000001",
    occurred_at: "2026-07-29T12:00:00.000Z",
    proposal,
    decision: "accepted",
    before_sha256: hash("a"),
    after_sha256: hash("b"),
    subject_model_context: model,
  });
  assert.deepEqual(event.affected_node_ids, [proposal.diffs[0]?.nodeId]);
  assert.equal(JSON.stringify(event).includes("diffs"), false);
  assert.equal(JSON.stringify(event).includes("sensitive document body"), false);
});

test("provenance answers source, AI, human followup, and material existence", () => {
  const trail = new SemanticAuditTrail();
  const node = "node_00000000000000000000000000000001";
  trail.recordAiDecision({
    event_id: "audit_00000000000000000000000000000001",
    project_id: "prj_00000000000000000000000000000001",
    occurred_at: "2026-07-29T12:00:00.000Z",
    proposal,
    decision: "accepted",
    before_sha256: hash("a"),
    after_sha256: hash("b"),
    subject_model_context: model,
  });
  trail.record({
    contract_kind: "semantic_audit_event",
    schema_version: "0.2.0",
    event_id: "audit_00000000000000000000000000000002",
    project_id: "prj_00000000000000000000000000000001",
    sequence: 1,
    occurred_at: "2026-07-29T12:01:00.000Z",
    actor: "user",
    action: "user_changed_after_ai",
    decision: "applied",
    affected_node_ids: [node],
    before_sha256: hash("b"),
    before_hash_subject: "document",
    after_sha256: hash("c"),
    after_hash_subject: "document",
    source_refs: [],
    subject_model_context: model,
  });
  trail.record({
    contract_kind: "semantic_audit_event",
    schema_version: "0.2.0",
    event_id: "audit_00000000000000000000000000000003",
    project_id: "prj_00000000000000000000000000000001",
    sequence: 2,
    occurred_at: "2026-07-29T12:02:00.000Z",
    actor: "user",
    action: "source_linked",
    decision: "applied",
    affected_node_ids: [node],
    before_sha256: hash("c"),
    before_hash_subject: "document",
    after_sha256: hash("d"),
    after_hash_subject: "document",
    source_refs: [
      {
        material_id: "mat_00000000000000000000000000000001",
        sha256: hash("e"),
        locator: "anchor:one",
      },
    ],
    subject_model_context: null,
  });
  const explanation = trail.explain(node, [
    { material_id: "mat_00000000000000000000000000000001", sha256: hash("e") },
  ]);
  assert.equal(explanation.aiDecisions.length, 1);
  assert.equal(explanation.humanFollowups.length, 1);
  assert.equal(explanation.sources.length, 1);
  assert.equal(explanation.materials[0]?.exists, true);
});

test("unknown credential or full-content fields are rejected and never recorded", () => {
  for (const field of ["api_key", "token", "secret", "password", "full_text"]) {
    const trail = new SemanticAuditTrail();
    assert.throws(
      () =>
        trail.record({
          contract_kind: "semantic_audit_event",
          schema_version: "0.2.0",
          event_id: "audit_00000000000000000000000000000001",
          project_id: "prj_00000000000000000000000000000001",
          sequence: 0,
          occurred_at: "2026-07-29T12:00:00.000Z",
          actor: "user",
          action: "ai_change_decided",
          decision: "accepted",
          affected_node_ids: ["node_00000000000000000000000000000001"],
          before_sha256: hash("a"),
          before_hash_subject: "document",
          after_sha256: hash("b"),
          after_hash_subject: "document",
          source_refs: [],
          subject_model_context: model,
          [field]: "sensitive document body",
        }),
      /SEMANTIC_AUDIT_EVENT_REJECTED/,
      field,
    );
    assert.deepEqual(trail.events(), [], field);
  }
});
