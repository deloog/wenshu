import assert from "node:assert/strict";
import test from "node:test";

import { validateKnowledgeBundle, validateProjectContract } from "../src/index.ts";
import { asRecord, validFixture } from "./fixture-helpers.ts";

test("semantic audit records metadata, not prompts or document content", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  fixture["prompt"] = "must not enter the audit truth";
  const result = validateProjectContract(fixture);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.every((entry) => entry.code === "PROJECT_SCHEMA"));
  }
});

test("a human decision retains the subject model without granting AI authority", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  assert.equal(validateProjectContract(fixture).ok, true);
  for (const actor of ["ai", "system"]) {
    const candidate = structuredClone(fixture);
    candidate["actor"] = actor;
    assert.equal(validateProjectContract(candidate).ok, false, actor);
  }
  const missingSubject = structuredClone(fixture);
  missingSubject["subject_model_context"] = null;
  assert.equal(validateProjectContract(missingSubject).ok, false);
});

test("AI decisions bind decision, nodes, and before/after hashes", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  const invalidCandidates = [
    { ...fixture, affected_node_ids: [] },
    { ...fixture, before_sha256: null, after_sha256: null },
    { ...fixture, after_sha256: fixture["before_sha256"] },
    { ...fixture, decision: "approved" },
    { ...fixture, decision: "rejected" },
  ];
  for (const candidate of invalidCandidates) {
    assert.equal(validateProjectContract(candidate).ok, false);
  }
  const rejected = structuredClone(fixture);
  rejected["decision"] = "rejected";
  rejected["after_sha256"] = rejected["before_sha256"];
  assert.equal(validateProjectContract(rejected).ok, true);
});

test("source and formal-version actions have explicit responsibility rules", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  const source = structuredClone(fixture);
  source["action"] = "source_linked";
  source["decision"] = "applied";
  source["subject_model_context"] = null;
  assert.equal(validateProjectContract(source).ok, true);
  source["source_refs"] = [];
  assert.equal(validateProjectContract(source).ok, false);

  const formal = structuredClone(fixture);
  formal["action"] = "formal_version_approved";
  formal["decision"] = "approved";
  formal["subject_model_context"] = null;
  formal["before_sha256"] = formal["after_sha256"];
  formal["affected_node_ids"] = [];
  formal["source_refs"] = [];
  assert.equal(validateProjectContract(formal).ok, true);
  formal["actor"] = "system";
  assert.equal(validateProjectContract(formal).ok, false);
});

test("timestamps and locators reject malformed values without inspecting model names", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  const badDate = structuredClone(fixture);
  badDate["occurred_at"] = "2026-02-31T12:00:00.000Z";
  assert.equal(validateProjectContract(badDate).ok, false);
  const badPackageDate = asRecord(await validFixture("knowledge-package"));
  badPackageDate["created_at"] = "2026-02-31T12:00:00.000Z";
  assert.equal(validateProjectContract(badPackageDate).ok, false);

  const badLocator = structuredClone(fixture);
  const refs = badLocator["source_refs"];
  if (!Array.isArray(refs)) {
    throw new Error("Audit fixture must contain source references.");
  }
  asRecord(refs[0])["locator"] = "这里是一段正文而不是定位符";
  assert.equal(validateProjectContract(badLocator).ok, false);

  for (const model of ["keystone", "monkey", "tokenizer"]) {
    const candidate = structuredClone(fixture);
    asRecord(candidate["subject_model_context"])["model"] = model;
    assert.equal(validateProjectContract(candidate).ok, true, model);
  }
  const unregisteredProvider = structuredClone(fixture);
  asRecord(unregisteredProvider["subject_model_context"])["provider"] = "other";
  assert.equal(validateProjectContract(unregisteredProvider).ok, false);
  const credentialField = structuredClone(fixture);
  asRecord(credentialField["subject_model_context"])["credential"] = "not-a-field";
  assert.equal(validateProjectContract(credentialField).ok, false);
});

test("semantic diagnostics identify the exact failed rule and JSON path", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  const cases = [
    {
      mutate: (candidate: Record<string, unknown>): void => {
        candidate["decision"] = "approved";
      },
      issue: { code: "PROJECT_AUDIT_DECISION_INVALID", path: "/decision" },
    },
    {
      mutate: (candidate: Record<string, unknown>): void => {
        candidate["actor"] = "system";
      },
      issue: { code: "PROJECT_AUDIT_RESPONSIBILITY_INVALID", path: "/actor" },
    },
    {
      mutate: (candidate: Record<string, unknown>): void => {
        candidate["after_sha256"] = candidate["before_sha256"];
      },
      issue: { code: "PROJECT_AUDIT_HASH_INVALID", path: "/after_sha256" },
    },
    {
      mutate: (candidate: Record<string, unknown>): void => {
        candidate["occurred_at"] = "2026-02-31T12:00:00.000Z";
      },
      issue: { code: "PROJECT_TIMESTAMP_INVALID", path: "/occurred_at" },
    },
    {
      mutate: (candidate: Record<string, unknown>): void => {
        candidate["before_hash_subject"] = "template";
      },
      issue: {
        code: "PROJECT_AUDIT_HASH_INVALID",
        path: "/before_hash_subject",
      },
    },
  ] as const;

  for (const entry of cases) {
    const candidate = structuredClone(fixture);
    entry.mutate(candidate);
    const result = validateProjectContract(candidate);
    assert.equal(result.ok, false, entry.issue.code);
    if (!result.ok) {
      assert.ok(
        result.issues.some(
          (actual) =>
            actual.code === entry.issue.code && actual.path === entry.issue.path,
        ),
        JSON.stringify(result),
      );
    }
  }
});

test("template application records template hashes rather than fabricated document hashes", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  fixture["actor"] = "system";
  fixture["action"] = "template_applied";
  fixture["decision"] = "applied";
  fixture["affected_node_ids"] = [];
  fixture["source_refs"] = [];
  fixture["subject_model_context"] = null;
  fixture["before_hash_subject"] = "template";
  fixture["after_hash_subject"] = "template";
  assert.equal(validateProjectContract(fixture).ok, true);

  const fabricatedDocumentSubject = structuredClone(fixture);
  fabricatedDocumentSubject["before_hash_subject"] = "document";
  fabricatedDocumentSubject["after_hash_subject"] = "document";
  assert.equal(validateProjectContract(fabricatedDocumentSubject).ok, false);

  const missingSubject = structuredClone(fixture);
  delete missingSubject["before_hash_subject"];
  delete missingSubject["after_hash_subject"];
  assert.equal(validateProjectContract(missingSubject).ok, false);

  const legacyTemplateEvent = structuredClone(fixture);
  legacyTemplateEvent["schema_version"] = "0.1.0";
  delete legacyTemplateEvent["before_hash_subject"];
  delete legacyTemplateEvent["after_hash_subject"];
  assert.equal(validateProjectContract(legacyTemplateEvent).ok, false);
});

test("the 0.1 reader remains available for non-template historical audit events", async () => {
  const legacy = asRecord(await validFixture("semantic-audit-event"));
  legacy["schema_version"] = "0.1.0";
  delete legacy["before_hash_subject"];
  delete legacy["after_hash_subject"];
  assert.equal(validateProjectContract(legacy).ok, true);
});

test("system has exactly one allowed action", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  const systemTemplate = structuredClone(fixture);
  systemTemplate["actor"] = "system";
  systemTemplate["action"] = "template_applied";
  systemTemplate["decision"] = "applied";
  systemTemplate["affected_node_ids"] = [];
  systemTemplate["source_refs"] = [];
  systemTemplate["subject_model_context"] = null;
  systemTemplate["before_hash_subject"] = "template";
  systemTemplate["after_hash_subject"] = "template";
  assert.equal(validateProjectContract(systemTemplate).ok, true);

  for (const action of [
    "ai_change_decided",
    "user_changed_after_ai",
    "source_linked",
    "formal_version_approved",
  ] as const) {
    const rejected = structuredClone(fixture);
    rejected["action"] = action;
    if (action === "user_changed_after_ai") {
      rejected["decision"] = "applied";
    }
    if (action === "source_linked") {
      rejected["decision"] = "applied";
      rejected["subject_model_context"] = null;
    }
    if (action === "formal_version_approved") {
      rejected["decision"] = "approved";
      rejected["subject_model_context"] = null;
      rejected["affected_node_ids"] = [];
      rejected["source_refs"] = [];
      rejected["after_sha256"] = rejected["before_sha256"];
    }
    assert.equal(validateProjectContract(rejected).ok, true, `${action}: user`);
    rejected["actor"] = "system";
    assert.equal(validateProjectContract(rejected).ok, false, action);
  }
});

test("only a user can approve a formal version in a complete bundle", async () => {
  const project = asRecord(await validFixture("project"));
  const manifest = await validFixture("knowledge-package");
  const audit = asRecord(await validFixture("semantic-audit-event"));
  const documentHash = asRecord(project["document"])["sha256"];
  const templateHash = asRecord(project["template"])["sha256"];
  audit["action"] = "formal_version_approved";
  audit["decision"] = "approved";
  audit["subject_model_context"] = null;
  audit["affected_node_ids"] = [];
  audit["source_refs"] = [];
  audit["before_sha256"] = documentHash;
  audit["after_sha256"] = documentHash;
  project["formal_versions"] = [
    {
      version_id: "ver_00000000000000000000000000000001",
      created_at: "2026-07-20T12:00:00.000Z",
      document_sha256: documentHash,
      template_sha256: templateHash,
      approval_event_id: audit["event_id"],
    },
  ];
  assert.equal(validateKnowledgeBundle(project, manifest, [audit]).ok, true);
  audit["actor"] = "system";
  assert.equal(validateKnowledgeBundle(project, manifest, [audit]).ok, false);
});
