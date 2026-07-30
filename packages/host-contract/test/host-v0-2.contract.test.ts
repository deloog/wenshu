import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HOST_CAPABILITIES,
  HOST_PAYLOAD_CAPABILITIES,
  HOST_PROTOCOL_VERSION_V0_2,
  hostPayloadSchemaId,
  isHostPayloadCapability,
  validateHostContract,
  validateHostPayload,
  validateHostSession,
} from "../src/index.ts";

async function readJson(path: URL): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("payload capability freeze is exactly the PB-10 minimal set", () => {
  assert.equal(HOST_PROTOCOL_VERSION_V0_2, "0.2.0");
  assert.deepEqual(
    [...HOST_PAYLOAD_CAPABILITIES],
    [
      "project.directory.select",
      "project.directory.authorize",
      "project.save.atomic",
      "project.save.as",
      "project.backup.create",
      "project.backup.restore",
      "file.export.write",
    ],
  );
  for (const capability of HOST_PAYLOAD_CAPABILITIES) {
    assert.ok(
      (HOST_CAPABILITIES as readonly string[]).includes(capability),
      capability,
    );
    assert.equal(
      hostPayloadSchemaId(capability, "input"),
      `wenshu.host.input.${capability}/0.2.0`,
    );
    assert.equal(
      hostPayloadSchemaId(capability, "output"),
      `wenshu.host.output.${capability}/0.2.0`,
    );
  }
  assert.equal(isHostPayloadCapability("font.catalog.list"), false);
});

test("every frozen payload schema id resolves to a concrete validator", () => {
  for (const capability of HOST_PAYLOAD_CAPABILITIES) {
    for (const kind of ["input", "output"] as const) {
      const schemaId = hostPayloadSchemaId(capability, kind);
      const missing = validateHostPayload(schemaId, { unexpected_key: 1 });
      assert.notEqual(missing.ok, true, schemaId);
      if (!missing.ok) {
        assert.ok(
          missing.issues.every((entry) => entry.code !== "HOST_PAYLOAD_SCHEMA_UNKNOWN"),
          `${schemaId} must point at a frozen entity schema`,
        );
      }
    }
  }
});

test("unknown payload schema ids fail closed", () => {
  const result = validateHostPayload("wenshu.host.input.font.catalog.list/0.2.0", {});
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.issues, [
      { code: "HOST_PAYLOAD_SCHEMA_UNKNOWN", path: "/" },
    ]);
  }
});

test("payload validators apply the value-level path precheck", () => {
  const schemaId = hostPayloadSchemaId("project.save.atomic", "input");
  const base = {
    grant_id: "grant_02020202020202020202020202020202",
    file_name: "report.md",
    content_base64: "SGVsbG8=",
    content_sha256: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969",
    expected_previous_sha256: null,
  };
  assert.equal(validateHostPayload(schemaId, base).ok, true);
  for (const hostile of ["output=../secret.txt", "..\\escape.md", "a\nb.md"]) {
    const result = validateHostPayload(schemaId, { ...base, file_name: hostile });
    assert.equal(result.ok, false, hostile);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "HOST_PLATFORM_FIELD_FORBIDDEN");
    }
    assert.ok(!JSON.stringify(result).includes(hostile));
  }
});

test("reused leaf definitions in the 0.2.0 envelope are byte-identical to 0.1.0", async () => {
  const v01 = (await readJson(
    new URL("../schema/host.schema.json", import.meta.url),
  )) as Record<string, Record<string, unknown>>;
  const v02 = (await readJson(
    new URL("../schema/host-0.2.0.schema.json", import.meta.url),
  )) as Record<string, Record<string, unknown>>;
  const reused = [
    "RequestId",
    "HostInstanceId",
    "CapabilityName",
    "ErrorCode",
    "Fallback",
    "JsonObject",
    "CapabilityLimits",
    "HostError",
  ];
  const v01Defs = v01["$defs"] ?? {};
  const v02Defs = v02["$defs"] ?? {};
  assert.notEqual(Object.keys(v01Defs).length, 0);
  for (const name of reused) {
    assert.deepEqual(v02Defs[name], v01Defs[name], name);
  }
  assert.notDeepEqual(v02Defs["ProtocolVersion"], v01Defs["ProtocolVersion"]);
});

test("0.2.0 session validates with exactly one terminal state", async () => {
  const registry = await readJson(
    new URL("../fixtures/valid/v0-2-0-registry.json", import.meta.url),
  );
  const request = await readJson(
    new URL("../fixtures/valid/v0-2-0-save-request.json", import.meta.url),
  );
  if (!isRecord(request)) {
    throw new Error("Request fixture must be an object.");
  }
  const success = {
    protocol_version: "0.2.0",
    kind: "success",
    request_id: request["request_id"],
    capability: "project.save.atomic",
    output: {
      grant_id: "grant_02020202020202020202020202020202",
      file_name: "report.md",
      sha256: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969",
      bytes_written: 5,
    },
  };
  assert.equal(validateHostSession(registry, [request, success]).ok, true);

  const cancelAfterTerminal = {
    protocol_version: "0.2.0",
    kind: "cancel",
    request_id: request["request_id"],
    reason: "user",
  };
  const duplicate = validateHostSession(registry, [
    request,
    success,
    cancelAfterTerminal,
  ]);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.ok(
      duplicate.issues.some((issue) => issue.code === "HOST_TERMINAL_STATE_DUPLICATE"),
    );
  }
});

test("0.2.0 registry rejects a supported payload capability with a mismatched schema id", async () => {
  const registry = await readJson(
    new URL("../fixtures/valid/v0-2-0-registry.json", import.meta.url),
  );
  if (!isRecord(registry) || !Array.isArray(registry["capabilities"])) {
    throw new Error("Registry fixture must contain capabilities.");
  }
  const capabilities = structuredClone(registry["capabilities"]);
  const target = capabilities[2];
  if (!isRecord(target)) {
    throw new Error("Capability declaration must be an object.");
  }
  target["output_schema"] = "wenshu.host.output.project.save.atomic/9.9.9";
  const result = validateHostContract({ ...registry, capabilities });
  assert.equal(result.ok, false);
});

test("all generated files identify their sources and avoid forbidden types", async () => {
  const generated: ReadonlyArray<readonly [string, RegExp]> = [
    ["../src/generated/host.ts", /Generated from schema\/host\.schema\.json/u],
    [
      "../src/generated/host-0.2.0.ts",
      /Generated from schema\/host-0\.2\.0\.schema\.json/u,
    ],
    [
      "../src/generated/payloads.ts",
      /Generated from schema\/host-payloads-0\.2\.0\.schema\.json/u,
    ],
  ];
  const forbiddenTypePattern = new RegExp(`\\b${"a" + "ny"}\\b`, "u");
  for (const [path, banner] of generated) {
    const content = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(content, banner, path);
    assert.doesNotMatch(content, forbiddenTypePattern, path);
  }
});
