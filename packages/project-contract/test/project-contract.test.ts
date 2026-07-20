import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  PROJECT_CONTRACT_VERSION,
  validateKnowledgeBundle,
  validateProjectContract,
} from "../src/index.ts";

async function readJson(path: URL): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function validFixture(name: string): Promise<unknown> {
  return readJson(new URL(`../fixtures/valid/${name}.json`, import.meta.url));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Fixture must be an object.");
  }
  return value as Record<string, unknown>;
}

test("v0 project contract version is frozen", () => {
  assert.equal(PROJECT_CONTRACT_VERSION, "0.1.0");
});

test("all valid contract kinds survive a JSON round trip", async (context) => {
  const directory = new URL("../fixtures/valid/", import.meta.url);
  for (const name of (await readdir(directory)).sort()) {
    await context.test(name, async () => {
      const original = await readJson(new URL(name, directory));
      const roundTripped = JSON.parse(JSON.stringify(original)) as unknown;
      const result = validateProjectContract(roundTripped);
      assert.equal(result.ok, true, JSON.stringify(result));
      if (result.ok) {
        assert.deepEqual(result.value, original);
        assert.ok(Object.isFrozen(result.value));
      }
    });
  }
});

test("knowledge bundle closes project, audit, material, and hash references", async () => {
  const result = validateKnowledgeBundle(
    await validFixture("project"),
    await validFixture("knowledge-package"),
    [await validFixture("semantic-audit-event")],
  );
  assert.deepEqual(result, { ok: true });
});

test("missing fields and future versions are rejected", async () => {
  for (const name of ["future-project", "missing-project-field"]) {
    const input = await readJson(
      new URL(`../fixtures/invalid/${name}.json`, import.meta.url),
    );
    const result = validateProjectContract(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((entry) => entry.code === "PROJECT_SCHEMA"));
    }
  }

  const versionFields = [
    ["project", "schema_version"],
    ["knowledge-package", "format_version"],
    ["semantic-audit-event", "schema_version"],
    ["compatibility", "policy_version"],
  ] as const;
  for (const [name, field] of versionFields) {
    const candidate = asRecord(await validFixture(name));
    candidate[field] = "0.2.0";
    assert.equal(validateProjectContract(candidate).ok, false, name);
  }
});

test("truth and derived package entries cannot exchange guarantees", async () => {
  const fixture = asRecord(await validFixture("knowledge-package"));
  const entries = fixture["entries"];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Knowledge package fixture must have entries.");
  }
  const first = asRecord(entries[0]);
  first["classification"] = "derived";
  first["required"] = false;
  first["rebuildable"] = true;
  const result = validateProjectContract(fixture);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) => entry.code === "PROJECT_TRUTH_DERIVED_MIXED",
      ),
    );
  }
});

test("semantic audit records metadata, not prompts or document content", async () => {
  const fixture = asRecord(await validFixture("semantic-audit-event"));
  fixture["prompt"] = "must not enter the audit truth";
  const result = validateProjectContract(fixture);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.every((entry) => entry.code === "PROJECT_SCHEMA"));
  }
});

test("AI actor and source-link actions require their narrow context", async () => {
  const aiFixture = asRecord(await validFixture("semantic-audit-event"));
  aiFixture["model_context"] = null;
  const aiResult = validateProjectContract(aiFixture);
  assert.equal(aiResult.ok, false);

  const sourceFixture = asRecord(await validFixture("semantic-audit-event"));
  sourceFixture["actor"] = "user";
  sourceFixture["model_context"] = null;
  sourceFixture["action"] = "source_linked";
  sourceFixture["decision"] = "applied";
  sourceFixture["source_refs"] = [];
  const sourceResult = validateProjectContract(sourceFixture);
  assert.equal(sourceResult.ok, false);

  const decisionFixture = asRecord(
    await validFixture("semantic-audit-event"),
  );
  decisionFixture["decision"] = "approved";
  const decisionResult = validateProjectContract(decisionFixture);
  assert.equal(decisionResult.ok, false);
});

test("bundle rejects missing audit events and mismatched project identity", async () => {
  const project = await validFixture("project");
  const manifest = await validFixture("knowledge-package");
  const audit = asRecord(await validFixture("semantic-audit-event"));
  audit["project_id"] = "prj_00000000000000000000000000000002";
  const result = validateKnowledgeBundle(project, manifest, [audit]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) => entry.code === "PROJECT_REFERENCE_MISSING",
      ),
    );
  }
});

test("bundle rejects duplicate audit inputs and orphan truth entries", async () => {
  const project = await validFixture("project");
  const manifest = asRecord(await validFixture("knowledge-package"));
  const audit = await validFixture("semantic-audit-event");
  assert.equal(
    validateKnowledgeBundle(project, manifest, [audit, audit]).ok,
    false,
  );

  const entries = manifest["entries"];
  if (!Array.isArray(entries)) {
    throw new Error("Knowledge package fixture must have entries.");
  }
  entries.push({
    path: "truth/materials/orphan.md",
    role: "truth.material",
    classification: "truth",
    required: true,
    sha256: "9999999999999999999999999999999999999999999999999999999999999999",
    size_bytes: 12,
    rebuildable: false,
  });
  assert.equal(validateKnowledgeBundle(project, manifest, [audit]).ok, false);
});

test("deep and accessor-bearing values fail without executing code", () => {
  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let index = 0; index < 100; index += 1) {
    const child: Record<string, unknown> = {};
    cursor["child"] = child;
    cursor = child;
  }
  const deepResult = validateProjectContract(deep);
  assert.equal(deepResult.ok, false);
  if (!deepResult.ok) {
    assert.equal(deepResult.issues[0]?.code, "PROJECT_BUDGET_EXCEEDED");
  }

  let invoked = false;
  const input = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(input, "contract_kind", {
    enumerable: true,
    get: () => {
      invoked = true;
      return "project";
    },
  });
  assert.equal(validateProjectContract(input).ok, false);
  assert.equal(invoked, false);
});

test("generated declarations identify their source and avoid forbidden types", async () => {
  const generated = await readFile(
    new URL("../src/generated/project-contract.ts", import.meta.url),
    "utf8",
  );
  assert.match(generated, /Generated from schema\/project-contract\.schema\.json/u);
  assert.doesNotMatch(generated, /\bany\b/u);
});
