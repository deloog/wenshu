import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  DOCUMENT_SCHEMA_VERSION,
  validateDocument,
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

test("v0 schema version is frozen", () => {
  assert.equal(DOCUMENT_SCHEMA_VERSION, "0.1.0");
});

test("all valid document fixtures pass", async (context) => {
  for (const file of await fixtureFiles("valid")) {
    await context.test(file.pathname, async () => {
      const result = validateDocument(await readJson(file));
      assert.equal(result.ok, true, JSON.stringify(result));
      if (result.ok) {
        assert.ok(Object.isFrozen(result.value));
      }
    });
  }
});

test("all invalid document fixtures fail with stable issue codes", async (context) => {
  for (const file of await fixtureFiles("invalid")) {
    await context.test(file.pathname, async () => {
      const fixture = await readJson(file);
      if (!isRecord(fixture) || typeof fixture.expectedIssue !== "string") {
        throw new Error(`Invalid negative fixture metadata: ${file.pathname}`);
      }
      const expectedIssue = fixture.expectedIssue;
      delete fixture.expectedIssue;
      const result = validateDocument(fixture);
      assert.equal(result.ok, false, file.pathname);
      if (!result.ok) {
        assert.ok(result.issues.some((issue) => issue.code === expectedIssue));
      }
    });
  }
});

test("validation diagnostics never echo document content", () => {
  const sentinel = "private-content-must-not-be-logged";
  const result = validateDocument({
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    documentId: "invalid",
    revision: 0,
    title: sentinel,
    language: "zh-CN",
    blocks: [],
    assets: [],
  });

  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(sentinel));
});

test("generated declarations avoid the forbidden type and identify their source", async () => {
  const generated = await readFile(
    new URL("../src/generated/document.ts", import.meta.url),
    "utf8",
  );
  const forbiddenTypePattern = new RegExp(`\\b${"a" + "ny"}\\b`, "u");

  assert.match(generated, /Generated from schema\/document\.schema\.json/u);
  assert.doesNotMatch(generated, forbiddenTypePattern);
});
