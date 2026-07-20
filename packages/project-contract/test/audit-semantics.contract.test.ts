import assert from "node:assert/strict";
import test from "node:test";

import {
  validateKnowledgeBundle,
  validateProjectContract,
} from "../src/index.ts";
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

test("timestamps, locators, and model identifiers reject ambiguous content", async () => {
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

  const badProvider = structuredClone(fixture);
  asRecord(badProvider["subject_model_context"])["provider"] =
    "sk-live-secret-shape";
  assert.equal(validateProjectContract(badProvider).ok, false);
  const uppercaseSecret = structuredClone(fixture);
  asRecord(uppercaseSecret["subject_model_context"])["model"] =
    "TOKEN-production-shape";
  assert.equal(validateProjectContract(uppercaseSecret).ok, false);
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
