import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPayloadHostRegistry,
  HOST_PAYLOAD_CAPABILITIES,
  validateHostContract,
} from "../src/index.ts";

test("payload host registry builder produces a self-valid 0.2.0 registry", () => {
  const registry = buildPayloadHostRegistry({
    hostKind: "electron",
    hostVersion: "test-1.0",
    instanceId: "host_02020202020202020202020202020202",
    payloadRegistryVersion: "0.2.0",
    additionalDeclarations: [
      {
        name: "print.pdf.export",
        capability_version: "0.1.0",
        support_status: "supported",
        permission_status: "not_applicable",
        input_schema: "wenshu.host.input.print.pdf.export/0.1.0",
        output_schema: "wenshu.host.output.print.pdf.export/0.1.0",
        limits: {
          max_concurrent_requests: 1,
          timeout_ms: 300000,
          max_payload_bytes: 0,
        },
        lifecycle: "request",
        cancellation: "none",
        progress: "none",
        error_codes: ["HOST_INVALID_REQUEST", "HOST_INTERNAL"],
        fallback: { strategy: "none", reason_code: "ELECTRON_PRINT_AVAILABLE" },
      },
    ],
  });
  assert.equal(registry.protocol_version, "0.2.0");
  assert.equal(registry.capabilities.length, 18);
  assert.equal(validateHostContract(registry).ok, true);
  const byName = new Map(registry.capabilities.map((entry) => [entry.name, entry]));
  for (const capability of HOST_PAYLOAD_CAPABILITIES) {
    assert.equal(byName.get(capability)?.support_status, "supported", capability);
    assert.equal(byName.get(capability)?.capability_version, "0.2.0", capability);
  }
  assert.equal(byName.get("font.catalog.list")?.support_status, "unsupported");
  assert.equal(
    byName.get("font.catalog.list")?.fallback.reason_code,
    "PB10_PAYLOAD_UNFROZEN",
  );
  assert.equal(byName.get("print.pdf.export")?.capability_version, "0.1.0");
});

test("capability support overrides stay explicit", () => {
  const registry = buildPayloadHostRegistry({
    hostKind: "browser",
    hostVersion: "test-1.0",
    instanceId: "host_03030303030303030303030303030303",
    capabilitySupport: { "project.backup.restore": "unsupported" },
  });
  const target = registry.capabilities.find(
    (entry) => entry.name === "project.backup.restore",
  );
  assert.equal(target?.support_status, "unsupported");
  assert.equal(target?.capability_version, "0.2.0");
  assert.equal(
    target?.input_schema,
    "wenshu.host.input.project.backup.restore/0.2.0",
    "unsupported payload capabilities still point at their frozen entity schema",
  );
});

test("builder fails closed on malformed registry ingredients", () => {
  assert.throws(() =>
    buildPayloadHostRegistry({
      hostKind: "electron",
      hostVersion: "test-1.0",
      instanceId: "not-a-host-id",
    }),
  );
});
