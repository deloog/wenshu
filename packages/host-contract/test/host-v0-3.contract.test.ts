import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPayloadHostRegistry,
  HOST_PAYLOAD_PROTOCOL_VERSION_V0_3,
  HOST_PAYLOAD_V0_3_CAPABILITIES,
  HOST_PROTOCOL_VERSION_V0_2,
  HOST_PROTOCOL_VERSION_V0_3,
  HOST_PROTOCOL_VERSIONS,
  hostPayloadSchemaIdV03,
  isHostPayloadCapabilityV03,
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

test("0.3.0 payload freeze is exactly the A-02 file.import.select set", () => {
  assert.equal(HOST_PAYLOAD_PROTOCOL_VERSION_V0_3, "0.3.0");
  assert.equal(HOST_PROTOCOL_VERSION_V0_3, "0.3.0");
  assert.deepEqual([...HOST_PROTOCOL_VERSIONS], ["0.1.0", "0.2.0", "0.3.0"]);
  assert.deepEqual([...HOST_PAYLOAD_V0_3_CAPABILITIES], ["file.import.select"]);
  assert.equal(
    hostPayloadSchemaIdV03("file.import.select", "input"),
    "wenshu.host.input.file.import.select/0.3.0",
  );
  assert.equal(
    hostPayloadSchemaIdV03("file.import.select", "output"),
    "wenshu.host.output.file.import.select/0.3.0",
  );
  assert.equal(isHostPayloadCapabilityV03("file.import.select"), true);
  assert.equal(isHostPayloadCapabilityV03("project.save.atomic"), false);
});

test("every 0.3.0 frozen payload schema id resolves to a concrete validator", () => {
  for (const capability of HOST_PAYLOAD_V0_3_CAPABILITIES) {
    for (const kind of ["input", "output"] as const) {
      const schemaId = hostPayloadSchemaIdV03(capability, kind);
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

test("reused leaf definitions in the 0.3.0 envelope are byte-identical to 0.2.0 and 0.1.0", async () => {
  const v01 = (await readJson(
    new URL("../schema/host.schema.json", import.meta.url),
  )) as Record<string, Record<string, unknown>>;
  const v02 = (await readJson(
    new URL("../schema/host-0.2.0.schema.json", import.meta.url),
  )) as Record<string, Record<string, unknown>>;
  const v03 = (await readJson(
    new URL("../schema/host-0.3.0.schema.json", import.meta.url),
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
  const v03Defs = v03["$defs"] ?? {};
  assert.notEqual(Object.keys(v03Defs).length, 0);
  for (const name of reused) {
    assert.deepEqual(v03Defs[name], v02Defs[name], name);
    assert.deepEqual(v03Defs[name], v01Defs[name], name);
  }
  assert.notDeepEqual(v03Defs["ProtocolVersion"], v02Defs["ProtocolVersion"]);
  assert.notDeepEqual(v03Defs["ProtocolVersion"], v01Defs["ProtocolVersion"]);
  assert.deepEqual(v03Defs["CapabilityVersion"], {
    type: "string",
    enum: ["0.1.0", "0.2.0", "0.3.0"],
  });
  // Structural message shapes stay byte-identical across all three envelopes.
  const shapes = [
    "HostRegistry",
    "CapabilityDeclaration",
    "HostRequest",
    "HostCancelRequest",
    "HostProgressEvent",
    "HostSuccessResult",
    "HostFailureResult",
    "HostCancelledResult",
  ];
  for (const name of shapes) {
    assert.deepEqual(v03Defs[name], v02Defs[name], name);
  }
});

test("reused leaf definitions in the 0.3.0 payloads schema are byte-identical to 0.2.0", async () => {
  const v02 = (await readJson(
    new URL("../schema/host-payloads-0.2.0.schema.json", import.meta.url),
  )) as Record<string, Record<string, unknown>>;
  const v03 = (await readJson(
    new URL("../schema/host-payloads-0.3.0.schema.json", import.meta.url),
  )) as Record<string, Record<string, unknown>>;
  const v02Defs = v02["$defs"] ?? {};
  const v03Defs = v03["$defs"] ?? {};
  assert.deepEqual(Object.keys(v03Defs).sort(), [
    "FileDisplayName",
    "FileImportSelectInput",
    "FileImportSelectOutput",
    "GrantId",
    "Sha256",
  ]);
  for (const name of ["GrantId", "Sha256"]) {
    assert.deepEqual(v03Defs[name], v02Defs[name], name);
  }
  const oneOf = v03["oneOf"];
  assert.ok(Array.isArray(oneOf) && oneOf.length === 2, "exactly two payload defs");
});

test("decisive dual-version: a frozen 0.2.0 registry still validates unchanged", async () => {
  // Hand-written 0.2.0 registry fixture (file.import.select is a /0.1.0 placeholder).
  const fixture = await readJson(
    new URL("../fixtures/valid/v0-2-0-registry.json", import.meta.url),
  );
  assert.equal(validateHostContract(fixture).ok, true);

  // The builder's 0.2.0 construction path stays available and self-valid.
  const legacy = buildPayloadHostRegistry({
    hostKind: "electron",
    hostVersion: "test-legacy-1.0",
    instanceId: "host_02020202020202020202020202020202",
    payloadRegistryVersion: "0.2.0",
  });
  assert.equal(legacy.protocol_version, "0.2.0");
  const byName = new Map(legacy.capabilities.map((entry) => [entry.name, entry]));
  const legacyImport = byName.get("file.import.select");
  assert.equal(legacyImport?.capability_version, "0.1.0");
  assert.equal(legacyImport?.support_status, "unsupported");
  assert.equal(
    legacyImport?.input_schema,
    "wenshu.host.input.file.import.select/0.1.0",
  );
  assert.equal(legacyImport?.fallback.reason_code, "PB10_PAYLOAD_UNFROZEN");
  // ①-b byte-level form: the builder's 0.2.0 placeholder declaration is
  // deep-equal to the PB-10-signed frozen fixture entry (MAJOR-1 remediation).
  if (!isRecord(fixture) || !Array.isArray(fixture["capabilities"])) {
    throw new Error("0.2.0 registry fixture must carry a capabilities array");
  }
  const fixtureImport = (
    fixture["capabilities"] as readonly Record<string, unknown>[]
  ).find((entry) => entry["name"] === "file.import.select");
  assert.deepEqual(legacyImport, fixtureImport);
  // The 0.2.0 build carries no 0.3.0 schema id anywhere.
  assert.equal(
    JSON.stringify(legacy).includes("/0.3.0"),
    false,
    "a 0.2.0 registry must not reference any 0.3.0 schema id",
  );
  assert.equal(validateHostContract(legacy).ok, true);
});

test("fail-closed: unknown builder option keys throw (MAJOR-1 remediation)", () => {
  // The audit probe that reported MAJOR-1 passed `protocolVersion` (a
  // nonexistent option) and silently received the default 0.3.0 registry.
  // Unknown keys must now be an explicit error, never a silent fallback.
  for (const bogus of ["protocolVersion", "payloadregistryVersion", "version"]) {
    assert.throws(
      () =>
        buildPayloadHostRegistry({
          hostKind: "electron",
          hostVersion: "test-bogus-1.0",
          instanceId: "host_04040404040404040404040404040404",
          [bogus]: "0.2.0",
        }),
      /Unknown payload registry option/u,
      `unknown option ${bogus} must throw`,
    );
  }
});

test("fail-closed: illegal payloadRegistryVersion values throw (MINOR-1)", () => {
  // A legal key with an illegal value must not silently upgrade to the
  // latest registry (JS callers, JSON config, `as` assertions bypass the
  // type-level literal). Value axis closed symmetrically with the key axis.
  for (const bogus of ["0.1.0", "0.3.0", "2.0.0", ""]) {
    assert.throws(
      () =>
        buildPayloadHostRegistry({
          hostKind: "electron",
          hostVersion: "test-bogus-1.0",
          instanceId: "host_05050505050505050505050505050505",
          payloadRegistryVersion: bogus as "0.2.0",
        }),
      /Unknown payload registry version/u,
      `illegal version ${JSON.stringify(bogus)} must throw`,
    );
  }
});

test("decisive dual-version: the 0.2.0 request/terminal chain is unchanged", async () => {
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
    protocol_version: HOST_PROTOCOL_VERSION_V0_2,
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
});

test("default builder emits a self-valid 0.3.0 registry with file.import.select concrete", () => {
  const registry = buildPayloadHostRegistry({
    hostKind: "electron",
    hostVersion: "test-3.0",
    instanceId: "host_03030303030303030303030303030303",
  });
  assert.equal(registry.protocol_version, "0.3.0");
  assert.equal(registry.capabilities.length, 18);
  assert.equal(validateHostContract(registry).ok, true);
  const byName = new Map(registry.capabilities.map((entry) => [entry.name, entry]));
  const importSelect = byName.get("file.import.select");
  assert.equal(importSelect?.capability_version, "0.3.0");
  assert.equal(importSelect?.support_status, "supported");
  assert.equal(
    importSelect?.input_schema,
    "wenshu.host.input.file.import.select/0.3.0",
  );
  assert.equal(
    importSelect?.output_schema,
    "wenshu.host.output.file.import.select/0.3.0",
  );
  for (const capability of [
    "project.directory.select",
    "project.directory.authorize",
    "project.save.atomic",
    "project.save.as",
    "project.backup.create",
    "project.backup.restore",
    "file.export.write",
  ] as const) {
    assert.equal(byName.get(capability)?.capability_version, "0.2.0", capability);
  }
  assert.equal(byName.get("font.catalog.list")?.capability_version, "0.1.0");

  const unsupported = buildPayloadHostRegistry({
    hostKind: "browser",
    hostVersion: "test-3.0",
    instanceId: "host_03030303030303030303030303030303",
    capabilitySupport: { "file.import.select": "unsupported" },
  });
  const declaration = unsupported.capabilities.find(
    (entry) => entry.name === "file.import.select",
  );
  assert.equal(declaration?.support_status, "unsupported");
  assert.equal(declaration?.capability_version, "0.3.0");
  assert.equal(
    declaration?.input_schema,
    "wenshu.host.input.file.import.select/0.3.0",
    "unsupported 0.3.0 capabilities still point at their frozen entity schema",
  );
  assert.deepEqual(declaration?.error_codes, ["HOST_UNSUPPORTED"]);
  assert.equal(validateHostContract(unsupported).ok, true);
});

test("0.3.0 session validates with exactly one terminal state", async () => {
  const registry = await readJson(
    new URL("../fixtures/valid/v0-3-0-registry.json", import.meta.url),
  );
  const request = await readJson(
    new URL("../fixtures/valid/v0-3-0-import-request.json", import.meta.url),
  );
  const success = await readJson(
    new URL("../fixtures/valid/v0-3-0-import-success.json", import.meta.url),
  );
  assert.equal(validateHostSession(registry, [request, success]).ok, true);

  if (!isRecord(request)) {
    throw new Error("Request fixture must be an object.");
  }
  const duplicate = validateHostSession(registry, [
    request,
    success,
    {
      protocol_version: "0.3.0",
      kind: "cancel",
      request_id: request["request_id"],
      reason: "user",
    },
  ]);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.ok(
      duplicate.issues.some((entry) => entry.code === "HOST_TERMINAL_STATE_DUPLICATE"),
    );
  }
});

test("0.3.0 requests deep-validate the frozen input payload", () => {
  const base = {
    protocol_version: "0.3.0",
    kind: "request",
    request_id: "req_03030303030303030303030303030310",
    capability: "file.import.select",
    capability_version: "0.3.0",
  };
  assert.equal(validateHostContract({ ...base, input: {} }).ok, true);

  const badShape = validateHostContract({ ...base, input: { multiple: "yes" } });
  assert.equal(badShape.ok, false);
  if (!badShape.ok) {
    assert.ok(badShape.issues.some((entry) => entry.code === "HOST_PAYLOAD_SCHEMA"));
  }

  const mismatch = validateHostContract({
    ...base,
    capability: "project.save.atomic",
    input: {},
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.ok(
      mismatch.issues.some((entry) => entry.code === "HOST_CAPABILITY_MISMATCH"),
    );
  }

  const hostile = validateHostContract({
    ...base,
    input: { purpose: "import_markdown", hint: "output=../secret.md" },
  });
  assert.equal(hostile.ok, false);
  if (!hostile.ok) {
    assert.equal(hostile.issues[0]?.code, "HOST_PLATFORM_FIELD_FORBIDDEN");
    assert.ok(!JSON.stringify(hostile).includes("secret"));
  }
});

test("0.2.0 payloads keep deep validation under the 0.3.0 envelope", () => {
  const request = {
    protocol_version: "0.3.0",
    kind: "request",
    request_id: "req_03030303030303030303030303030311",
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: { grant_id: "not-a-grant" },
  };
  const result = validateHostContract(request);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((entry) => entry.code === "HOST_PAYLOAD_SCHEMA"));
  }
});

test("file.import.select output enforces handles only, never paths", () => {
  const outputSchemaId = hostPayloadSchemaIdV03("file.import.select", "output");
  const file = {
    grant_id: "grant_03030303030303030303030303030303",
    file_name: "report draft.md",
    content_sha256: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969",
    size_bytes: 5,
  };
  assert.equal(validateHostPayload(outputSchemaId, { files: [file] }).ok, true);

  // Display names that are dot segments or separators fail the frozen schema.
  for (const badName of [".", "..", "a/b.md", "a\\b.md", "a:b.md", "a\nb.md"]) {
    const result = validateHostPayload(outputSchemaId, {
      files: [{ ...file, file_name: badName }],
    });
    assert.equal(result.ok, false, badName);
    if (!result.ok) {
      assert.ok(
        result.issues.some(
          (entry) =>
            entry.code === "HOST_PAYLOAD_SCHEMA" ||
            entry.code === "HOST_PLATFORM_FIELD_FORBIDDEN",
        ),
        badName,
      );
    }
    assert.ok(!JSON.stringify(result).includes(badName), badName);
  }

  // Absolute paths are refused by the value-level precheck before any schema read.
  const withPath = validateHostPayload(outputSchemaId, {
    files: [{ ...file, file_name: "C:\\Users\\owner\\secret.md" }],
  });
  assert.equal(withPath.ok, false);
  if (!withPath.ok) {
    assert.equal(withPath.issues[0]?.code, "HOST_PLATFORM_FIELD_FORBIDDEN");
  }

  // The dot-segment rejection must come from the schema, not the precheck.
  const dotSegment = validateHostPayload(outputSchemaId, {
    files: [{ ...file, file_name: "." }],
  });
  assert.equal(dotSegment.ok, false);
  if (!dotSegment.ok) {
    assert.ok(dotSegment.issues.some((entry) => entry.code === "HOST_PAYLOAD_SCHEMA"));
  }

  for (const broken of [
    { files: [] },
    { files: [{ ...file, size_bytes: -1 }] },
    { files: [{ ...file, file_name: "a.md", extra: 1 }] },
    { files: [{ grant_id: file.grant_id }] },
  ]) {
    assert.equal(
      validateHostPayload(outputSchemaId, broken).ok,
      false,
      JSON.stringify(broken),
    );
  }
});

test("0.3.0 registry rejects a mismatched schema id or version for file.import.select", async () => {
  const registry = await readJson(
    new URL("../fixtures/valid/v0-3-0-registry.json", import.meta.url),
  );
  if (!isRecord(registry) || !Array.isArray(registry["capabilities"])) {
    throw new Error("Registry fixture must contain capabilities.");
  }
  const index = registry["capabilities"].findIndex(
    (entry) => isRecord(entry) && entry["name"] === "file.import.select",
  );
  assert.notEqual(index, -1);

  const wrongId = structuredClone(registry["capabilities"]);
  const target = wrongId[index];
  if (!isRecord(target)) {
    throw new Error("Capability declaration must be an object.");
  }
  target["output_schema"] = "wenshu.host.output.file.import.select/0.2.0";
  const wrongIdResult = validateHostContract({ ...registry, capabilities: wrongId });
  assert.equal(wrongIdResult.ok, false);
  if (!wrongIdResult.ok) {
    assert.ok(
      wrongIdResult.issues.some(
        (entry) =>
          entry.code === "HOST_REGISTRY_INCONSISTENT" &&
          entry.path === `/capabilities/${index}`,
      ),
    );
  }

  const wrongVersion = structuredClone(registry["capabilities"]);
  const versionTarget = wrongVersion[index];
  if (!isRecord(versionTarget)) {
    throw new Error("Capability declaration must be an object.");
  }
  versionTarget["capability_version"] = "0.2.0";
  const wrongVersionResult = validateHostContract({
    ...registry,
    capabilities: wrongVersion,
  });
  assert.equal(wrongVersionResult.ok, false);
  if (!wrongVersionResult.ok) {
    assert.ok(
      wrongVersionResult.issues.some(
        (entry) => entry.code === "HOST_REGISTRY_INCONSISTENT",
      ),
    );
  }
});
