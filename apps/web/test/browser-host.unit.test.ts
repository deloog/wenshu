/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";

import { validateHostContract, validateHostSession } from "@wenshu/host-contract";

import { createBrowserHost, sha256 } from "../src/host.ts";

let requestCounter = 0;

function nextId(): string {
  requestCounter += 1;
  return `req_${String(requestCounter).padStart(32, "0")}`;
}

function b64(content: string): string {
  return btoa(content);
}

function bytes(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

function selectRequest(): Record<string, unknown> {
  return {
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.directory.select",
    capability_version: "0.2.0",
    input: {},
  };
}

async function selectGrant(
  host: ReturnType<typeof createBrowserHost>,
): Promise<string> {
  const response = (await host.invoke(selectRequest())) as Record<string, unknown>;
  assert.equal(response["kind"], "success");
  return String((response["output"] as Record<string, unknown>)["grant_id"]);
}

test("browser host registry is self-valid and exposes all 7 supported payload capabilities", async () => {
  const host = createBrowserHost();
  assert.equal(validateHostContract(host.registry).ok, true);
  const registry = host.registry as {
    protocol_version: string;
    capabilities: readonly Record<string, unknown>[];
  };
  assert.equal(registry.protocol_version, "0.3.0");
  const supported = registry.capabilities
    .filter((entry) => entry["support_status"] === "supported")
    .map((entry) => entry["name"]);
  assert.deepEqual(supported.sort(), [
    "file.export.write",
    "project.backup.create",
    "project.backup.restore",
    "project.directory.authorize",
    "project.directory.select",
    "project.save.as",
    "project.save.atomic",
  ]);
});

test("file.import.select is honestly declared unsupported (ADR-0029 ①-c)", async () => {
  const host = createBrowserHost();
  const registry = host.registry as {
    capabilities: readonly Record<string, unknown>[];
  };
  const declaration = registry.capabilities.find(
    (entry) => entry["name"] === "file.import.select",
  );
  assert.ok(declaration);
  assert.equal(declaration["capability_version"], "0.3.0");
  assert.equal(declaration["support_status"], "unsupported");
  assert.equal(declaration["permission_status"], "not_applicable");
  assert.deepEqual(declaration["error_codes"], ["HOST_UNSUPPORTED"]);
  assert.deepEqual(declaration["fallback"], {
    strategy: "manual_file_picker",
    reason_code: "BROWSER_HOST_NO_IMPORT_PIPELINE",
  });
});

test("invoking file.import.select degrades with the declared fallback, no transcript entry", async () => {
  const host = createBrowserHost();
  const response = (await host.invoke({
    protocol_version: "0.3.0",
    kind: "request",
    request_id: nextId(),
    capability: "file.import.select",
    capability_version: "0.3.0",
    input: { purpose: "import_markdown", multiple: false, extensions: ["md"] },
  })) as Record<string, unknown>;
  assert.equal(response["protocol_version"], "0.3.0");
  assert.equal(response["kind"], "failure");
  assert.equal(
    (response["error"] as Record<string, unknown>)["code"],
    "HOST_UNSUPPORTED",
  );
  assert.deepEqual(response["fallback"], {
    strategy: "manual_file_picker",
    reason_code: "BROWSER_HOST_NO_IMPORT_PIPELINE",
  });
  assert.equal(validateHostContract(response).ok, true);
  assert.equal(host.transcript().length, 0);
});

test("virtual save/export round-trip", async () => {
  const host = createBrowserHost();
  const grantId = await selectGrant(host);

  const first = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: "report.md",
      content_base64: b64("hello"),
      content_sha256: await sha256(bytes("hello")),
      expected_previous_sha256: null,
    },
  })) as Record<string, unknown>;
  assert.equal(first["kind"], "success");

  const exportResponse = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "file.export.write",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: "report.md",
      content_base64: b64("world"),
      content_sha256: await sha256(bytes("world")),
      media_type: "text/plain",
      overwrite: true,
    },
  })) as Record<string, unknown>;
  assert.equal(exportResponse["kind"], "success");
  assert.equal(validateHostSession(host.registry, host.transcript()).ok, true);
});

test("cancelled select returns a valid cancelled terminal", async () => {
  const host = createBrowserHost({
    selectDirectory: () => Promise.resolve({ status: "cancelled" }),
  });
  const response = (await host.invoke(selectRequest())) as Record<string, unknown>;
  assert.equal(response["kind"], "cancelled");
  assert.equal(response["reason"], "user");
});

test("unsupported capabilities degrade without entering the transcript", async () => {
  const host = createBrowserHost();
  const response = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "font.catalog.list",
    capability_version: "0.1.0",
    input: {},
  })) as Record<string, unknown>;
  assert.equal(response["kind"], "failure");
  assert.equal(
    (response["error"] as Record<string, unknown>)["code"],
    "HOST_UNSUPPORTED",
  );
  assert.equal(host.transcript().length, 0);
});

test("virtual backup snapshot and restore preserves document bytes", async () => {
  const host = createBrowserHost();
  const grantId = await selectGrant(host);
  const content = "version-one";
  const originalSha = await sha256(bytes(content));
  await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: "doc.md",
      content_base64: b64(content),
      content_sha256: originalSha,
      expected_previous_sha256: null,
    },
  });

  const backup = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.backup.create",
    capability_version: "0.2.0",
    input: { grant_id: grantId },
  })) as Record<string, unknown>;
  assert.equal(backup["kind"], "success");
  const backupId = String((backup["output"] as Record<string, unknown>)["backup_id"]);
  assert.match(backupId, /^backup_[0-9a-f]{32}$/u);

  await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: "doc.md",
      content_base64: b64("version-two"),
      content_sha256: await sha256(bytes("version-two")),
      expected_previous_sha256: originalSha,
    },
  });

  const restored = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.backup.restore",
    capability_version: "0.2.0",
    input: { grant_id: grantId, backup_id: backupId },
  })) as Record<string, unknown>;
  assert.equal(restored["kind"], "success");

  const postRestore = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: "doc.md",
      content_base64: b64("version-three"),
      content_sha256: await sha256(bytes("version-three")),
      expected_previous_sha256: originalSha,
    },
  })) as Record<string, unknown>;
  assert.equal(
    postRestore["kind"],
    "success",
    "restored content must match backup bytes",
  );
  assert.equal(validateHostSession(host.registry, host.transcript()).ok, true);
});

test("late cancel does not emit a second terminal", async () => {
  const host = createBrowserHost();
  const grantId = await selectGrant(host);
  const save = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextId(),
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: "x.md",
      content_base64: b64("x"),
      content_sha256: await sha256(bytes("x")),
      expected_previous_sha256: null,
    },
  })) as Record<string, unknown>;
  assert.equal(save["kind"], "success");
  const late = {
    protocol_version: "0.2.0",
    kind: "cancel",
    request_id: save["request_id"],
    reason: "user",
  };
  assert.equal(await host.cancel(late), null);
  assert.equal(host.transcript().length, 4);
  const violated = validateHostSession(host.registry, [...host.transcript(), late]);
  assert.equal(violated.ok, false);
  if (!violated.ok) {
    assert.ok(
      violated.issues.some((issue) => issue.code === "HOST_TERMINAL_STATE_DUPLICATE"),
    );
  }
});
