import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  TEMPLATE_DSL_VERSION,
  validateTemplate,
} from "../src/index.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(path: URL): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function fixtureFiles(kind: "invalid" | "valid"): Promise<URL[]> {
  const directory = new URL(`../fixtures/${kind}/`, import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  return names.map((name) => new URL(name, directory));
}

test("v0 template DSL version is frozen", () => {
  assert.equal(TEMPLATE_DSL_VERSION, "0.1.0");
});

test("all valid template fixtures pass", async (context) => {
  const files = [
    ...(await fixtureFiles("valid")),
    new URL(
      "../../../docs/poc-a/fixtures/formal-business.template.json",
      import.meta.url,
    ),
  ];
  for (const file of files) {
    await context.test(file.pathname, async () => {
      const result = validateTemplate(await readJson(file));
      assert.equal(result.ok, true, JSON.stringify(result));
      if (result.ok) {
        assert.ok(Object.isFrozen(result.value));
      }
    });
  }
});

test("all invalid fixtures fail with stable issue codes", async (context) => {
  for (const file of await fixtureFiles("invalid")) {
    await context.test(file.pathname, async () => {
      const fixture = await readJson(file);
      if (!isRecord(fixture) || typeof fixture["expectedIssue"] !== "string") {
        throw new Error(`Invalid negative fixture metadata: ${file.pathname}`);
      }
      const expectedIssue = fixture["expectedIssue"];
      delete fixture["expectedIssue"];
      const result = validateTemplate(fixture);
      assert.equal(result.ok, false, file.pathname);
      if (!result.ok) {
        assert.ok(result.issues.some((issue) => issue.code === expectedIssue));
      }
    });
  }
});

test("future versions, migration instructions, and unknown rules are rejected", async () => {
  const fixture = await readJson(
    new URL("../fixtures/valid/minimal.json", import.meta.url),
  );
  if (!isRecord(fixture)) {
    throw new Error("Minimal template fixture must be an object.");
  }

  for (const candidate of [
    { ...fixture, dsl_version: "0.2.0" },
    { ...fixture, migration_rules: [{ from: "0.0.0" }] },
    { ...fixture, unknown_rule: true },
  ]) {
    const result = validateTemplate(candidate);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((issue) => issue.code === "TEMPLATE_SCHEMA"));
    }
  }
});

test("function values are rejected before schema interpretation", () => {
  const result = validateTemplate({
    dsl_version: TEMPLATE_DSL_VERSION,
    transform: (): string => "must-not-run",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "TEMPLATE_DYNAMIC_CODE_FORBIDDEN");
  }
});

test("property accessors are rejected without invocation", () => {
  let invoked = false;
  const input = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(input, "layout", {
    enumerable: true,
    get: (): unknown => {
      invoked = true;
      return {};
    },
  });

  const result = validateTemplate(input);
  assert.equal(result.ok, false);
  assert.equal(invoked, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "TEMPLATE_DYNAMIC_CODE_FORBIDDEN");
  }
});

test("security diagnostics never echo untrusted values", () => {
  const sentinel = "private-network-location-must-not-be-logged";
  const result = validateTemplate({ endpoint: sentinel });
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(sentinel));
});

test("generated declarations identify their source and avoid forbidden types", async () => {
  const generated = await readFile(
    new URL("../src/generated/template.ts", import.meta.url),
    "utf8",
  );
  const forbiddenTypePattern = new RegExp(`\\b${"a" + "ny"}\\b`, "u");
  assert.match(generated, /Generated from schema\/template\.schema\.json/u);
  assert.doesNotMatch(generated, forbiddenTypePattern);
});
