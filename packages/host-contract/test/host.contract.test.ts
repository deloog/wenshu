import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  HOST_CAPABILITIES,
  HOST_PROTOCOL_VERSION,
  validateHostContract,
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

test("v0 host protocol and capability allowlist are frozen", () => {
  assert.equal(HOST_PROTOCOL_VERSION, "0.1.0");
  assert.equal(HOST_CAPABILITIES.length, 18);
  assert.equal(new Set(HOST_CAPABILITIES).size, HOST_CAPABILITIES.length);
});

test("supported, denied, cancelled, timed out, progress, and degraded fixtures pass", async (context) => {
  for (const file of await fixtureFiles("valid")) {
    await context.test(file.pathname, async () => {
      const result = validateHostContract(await readJson(file));
      assert.equal(result.ok, true, JSON.stringify(result));
      if (result.ok) {
        assert.ok(Object.isFrozen(result.value));
      }
    });
  }
});

test("invalid host fixtures fail with stable issue codes", async (context) => {
  for (const file of await fixtureFiles("invalid")) {
    await context.test(file.pathname, async () => {
      const fixture = await readJson(file);
      if (
        !isRecord(fixture) ||
        typeof fixture["expectedIssue"] !== "string" ||
        typeof fixture["expectedPath"] !== "string"
      ) {
        throw new Error(`Invalid negative fixture metadata: ${file.pathname}`);
      }
      const expectedIssue = fixture["expectedIssue"];
      const expectedPath = fixture["expectedPath"];
      delete fixture["expectedIssue"];
      delete fixture["expectedPath"];
      const result = validateHostContract(fixture);
      assert.equal(result.ok, false, file.pathname);
      if (!result.ok) {
        assert.ok(
          result.issues.some(
            (issue) => issue.code === expectedIssue && issue.path === expectedPath,
          ),
        );
      }
    });
  }
});

test("registry must declare every capability exactly once", async () => {
  const fixture = await readJson(
    new URL("../fixtures/valid/browser-registry.json", import.meta.url),
  );
  if (!isRecord(fixture) || !Array.isArray(fixture["capabilities"])) {
    throw new Error("Registry fixture must contain capabilities.");
  }
  const result = validateHostContract({
    ...fixture,
    capabilities: fixture["capabilities"].slice(1),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.code === "HOST_REGISTRY_INCOMPLETE"));
  }
});

test("registry schema identities and progress totals remain consistent", async () => {
  const fixture = await readJson(
    new URL("../fixtures/valid/browser-registry.json", import.meta.url),
  );
  if (!isRecord(fixture) || !Array.isArray(fixture["capabilities"])) {
    throw new Error("Registry fixture must contain capabilities.");
  }
  const capabilities = structuredClone(fixture["capabilities"]);
  const first = capabilities[0];
  if (!isRecord(first)) {
    throw new Error("Capability declaration must be an object.");
  }
  first["input_schema"] = "wenshu.host.input.wrong/0.1.0";

  const registryResult = validateHostContract({ ...fixture, capabilities });
  assert.equal(registryResult.ok, false);
  if (!registryResult.ok) {
    assert.ok(
      registryResult.issues.some(
        (issue) => issue.code === "HOST_REGISTRY_INCONSISTENT",
      ),
    );
  }

  const progressResult = validateHostContract({
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "progress",
    request_id: "req_00000000000000000000000000000018",
    capability: "file.export.write",
    sequence: 1,
    phase: "running",
    completed: 2,
    total: 1,
    message_key: "host.export.writing",
  });
  assert.equal(progressResult.ok, false);
  if (!progressResult.ok) {
    assert.ok(
      progressResult.issues.some((issue) => issue.code === "HOST_PROGRESS_INVALID"),
    );
  }
});

test("property accessors are rejected without invocation", () => {
  let invoked = false;
  const input = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(input, "payload", {
    enumerable: true,
    get: (): unknown => {
      invoked = true;
      return {};
    },
  });
  const result = validateHostContract(input);
  assert.equal(result.ok, false);
  assert.equal(invoked, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "HOST_PLATFORM_FIELD_FORBIDDEN");
  }
});

test("inherited accessors are rejected without invocation", () => {
  let invoked = false;
  const prototype = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(prototype, "protocol_version", {
    get: (): unknown => {
      invoked = true;
      return HOST_PROTOCOL_VERSION;
    },
  });
  const result = validateHostContract(Object.create(prototype) as unknown);
  assert.equal(result.ok, false);
  assert.equal(invoked, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "HOST_PLATFORM_FIELD_FORBIDDEN");
  }
});

test("deep host payloads fail with a stable budget issue", () => {
  let input: Record<string, unknown> = {};
  for (let index = 0; index < 50; index += 1) {
    input = { child: input };
  }
  const result = validateHostContract({
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "request",
    request_id: "req_00000000000000000000000000000020",
    capability: "file.import.select",
    capability_version: "0.1.0",
    input,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "HOST_BUDGET_EXCEEDED");
  }
});

test("diagnostics never echo host payload values", () => {
  const sentinel = "private-host-value-must-not-be-logged";
  const result = validateHostContract({
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "request",
    request_id: "invalid",
    capability: "file.import.select",
    capability_version: "0.1.0",
    input: { path: sentinel },
  });
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(sentinel));
});

test("generated declarations identify their source and avoid forbidden types", async () => {
  const generated = await readFile(
    new URL("../src/generated/host.ts", import.meta.url),
    "utf8",
  );
  const forbiddenTypePattern = new RegExp(`\\b${"a" + "ny"}\\b`, "u");
  assert.match(generated, /Generated from schema\/host\.schema\.json/u);
  assert.doesNotMatch(generated, forbiddenTypePattern);
});
