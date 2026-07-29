import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateHostContract } from "@wenshu/host-contract";

const root = resolve(import.meta.dirname, "../../..");
const shell = resolve(root, "apps/arkweb-shell");
const bridge = await readFile(
  resolve(shell, "entry/src/main/ets/pages/HostBridge.ets"),
  "utf8",
);
const hap = resolve(
  shell,
  "entry/build/default/outputs/default/entry-default-unsigned.hap",
);
const expectedCapabilities = [
  "project.directory.select",
  "project.directory.authorize",
  "project.save.atomic",
  "project.save.as",
  "project.backup.create",
  "project.backup.restore",
  "file.import.select",
  "file.export.write",
  "print.pdf.export",
  "font.catalog.list",
  "font.catalog.check",
  "window.control",
  "clipboard.text.write",
  "share.invoke",
  "link.open.external",
  "secret.credential.manage",
  "secret.credential.status",
  "platform.info.read",
];
const found = [...bridge.matchAll(/'([a-z]+(?:\.[a-z]+)+)'/gu)]
  .map((match) => match[1])
  .filter((name) => expectedCapabilities.includes(name));
if (JSON.stringify(found) !== JSON.stringify(expectedCapabilities)) {
  throw new Error("ArkWeb HostBridge capability declaration differs from v0 whitelist");
}
if (!bridge.includes("support_status: 'unsupported'")) {
  throw new Error("ArkWeb HostBridge must not claim an unsupported capability");
}
const capabilities = expectedCapabilities.map((name) => ({
  name,
  capability_version: "0.1.0",
  support_status: "unsupported",
  permission_status: "not_applicable",
  input_schema: `wenshu.host.input.${name}/0.1.0`,
  output_schema: `wenshu.host.output.${name}/0.1.0`,
  limits: { max_concurrent_requests: 1, timeout_ms: 300000, max_payload_bytes: 0 },
  lifecycle: "request",
  cancellation: "none",
  progress: "none",
  error_codes: ["HOST_UNSUPPORTED"],
  fallback: { strategy: "read_only", reason_code: "PA14H_OUT_OF_SCOPE" },
}));
const registry = {
  protocol_version: "0.1.0",
  kind: "registry",
  host_kind: "arkweb",
  host_version: "6.1.1.290",
  instance_id: "host_14a00000000000000000000000000000",
  capabilities,
};
const contract = validateHostContract(registry);
if (!contract.ok)
  throw new Error(`ArkWeb registry invalid: ${contract.issues[0]?.code}`);
if (!existsSync(hap)) throw new Error("expected real HAP output is absent");
const hapBytes = await readFile(hap);
const resources = await Promise.all([
  readFile(resolve(shell, "entry/src/main/resources/rawfile/probe/print.html")),
  readFile(resolve(shell, "entry/src/main/resources/rawfile/probe/golden-report.md")),
]);
process.stdout.write(
  `${JSON.stringify({
    hapBytes: hapBytes.byteLength,
    hapSha256: createHash("sha256").update(hapBytes).digest("hex"),
    hostCapabilities: capabilities.length,
    hostSupportedCapabilities: 0,
    staticProbeBytes: resources[0].byteLength,
    fixtureBytes: resources[1].byteLength,
    runtime: "not_measured_without_device_or_emulator",
  })}\n`,
);
