import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { DOCUMENT_SCHEMA_VERSION, validateDocument } from "@wenshu/document-model";
import { TEMPLATE_DSL_VERSION, validateTemplate } from "@wenshu/template-model";

import {
  PROJECT_CONTRACT_VERSION,
  PROJECT_UPSTREAM_VERSIONS,
  validateKnowledgeBundle,
  validateProjectContract,
} from "../src/index.ts";
import contractSchema from "../schema/project-contract.schema.json" with { type: "json" };
import { asRecord, readJson, validFixture } from "./fixture-helpers.ts";

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

test("invalid fixtures fail with stable issue codes and paths", async () => {
  for (const name of ["future-project", "missing-project-field"]) {
    const input = asRecord(
      await readJson(new URL(`../fixtures/invalid/${name}.json`, import.meta.url)),
    );
    const expectedIssue = input["expectedIssue"];
    const expectedPath = input["expectedPath"];
    if (typeof expectedIssue !== "string" || typeof expectedPath !== "string") {
      throw new Error(`Invalid negative fixture metadata: ${name}`);
    }
    delete input["expectedIssue"];
    delete input["expectedPath"];
    const result = validateProjectContract(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.issues.some(
          (entry) => entry.code === expectedIssue && entry.path === expectedPath,
        ),
      );
    }
  }
});

test("future versions are rejected across all contract kinds", async () => {
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
      result.issues.some((entry) => entry.code === "PROJECT_TRUTH_DERIVED_MIXED"),
    );
  }
});

test("package paths agree with their truth or derived roles", async () => {
  const manifest = asRecord(await validFixture("knowledge-package"));
  const entries = manifest["entries"];
  if (!Array.isArray(entries)) {
    throw new Error("Knowledge package fixture must have entries.");
  }
  asRecord(entries[0])["path"] = "derived/project.json";
  const result = validateProjectContract(manifest);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (entry) =>
          entry.code === "PROJECT_PACKAGE_PATH_INVALID" &&
          entry.path === "/entries/0/path",
      ),
    );
  }
});

test("upstream versions and ID rules are executable cross-package contracts", async () => {
  assert.deepEqual(PROJECT_UPSTREAM_VERSIONS, {
    document: DOCUMENT_SCHEMA_VERSION,
    template: TEMPLATE_DSL_VERSION,
  });
  const compatibility = asRecord(await validFixture("compatibility"));
  const readers = asRecord(compatibility["readers"]);
  assert.equal(readers["document"], DOCUMENT_SCHEMA_VERSION);
  assert.equal(readers["template"], TEMPLATE_DSL_VERSION);

  const definitions = asRecord(contractSchema["$defs"]);
  const documentReference = asRecord(definitions["DocumentReference"]);
  const documentProperties = asRecord(documentReference["properties"]);
  assert.equal(
    asRecord(documentProperties["schema_version"])["const"],
    DOCUMENT_SCHEMA_VERSION,
  );
  const templateReference = asRecord(definitions["TemplateReference"]);
  const templateProperties = asRecord(templateReference["properties"]);
  assert.equal(
    asRecord(templateProperties["dsl_version"])["const"],
    TEMPLATE_DSL_VERSION,
  );

  const document = await readJson(
    new URL("../../document-model/fixtures/valid/minimal.json", import.meta.url),
  );
  const template = await readJson(
    new URL("../../template-model/fixtures/valid/minimal.json", import.meta.url),
  );
  assert.equal(validateDocument(document).ok, true);
  assert.equal(validateTemplate(template).ok, true);
  const project = asRecord(await validFixture("project"));
  assert.equal(
    asRecord(project["document"])["document_id"],
    asRecord(document)["documentId"],
  );
  assert.equal(
    asRecord(project["template"])["template_id"],
    asRecord(template)["template_id"],
  );
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
      result.issues.some((entry) => entry.code === "PROJECT_REFERENCE_MISSING"),
    );
  }
});

test("bundle rejects duplicate audit inputs and orphan truth entries", async () => {
  const project = await validFixture("project");
  const manifest = asRecord(await validFixture("knowledge-package"));
  const audit = await validFixture("semantic-audit-event");
  assert.equal(validateKnowledgeBundle(project, manifest, [audit, audit]).ok, false);

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
