import { HOST_CAPABILITIES, validateHostContract } from "./contract.ts";
import type { HostRegistry as HostRegistryV02 } from "./generated/host-0.2.0.ts";
import {
  hostPayloadSchemaId,
  isHostPayloadCapability,
  type HostPayloadCapability,
} from "./payloads.ts";

export type PayloadSupportStatus = "supported" | "degraded" | "unsupported";

export interface PayloadHostRegistryOptions {
  readonly hostKind: "browser" | "electron" | "arkweb";
  readonly hostVersion: string;
  readonly instanceId: string;
  /** Defaults to "supported" for every frozen payload capability. */
  readonly capabilitySupport?: Partial<
    Readonly<Record<HostPayloadCapability, PayloadSupportStatus>>
  >;
  /** Additional declarations for capabilities outside the PB-10 frozen set (for example print.pdf.export). */
  readonly additionalDeclarations?: readonly Record<string, unknown>[];
  /** Per-capability timeout overrides; applied identically to declarations and enforcement. */
  readonly timeoutMs?: Partial<Readonly<Record<HostPayloadCapability, number>>>;
}

const PAYLOAD_CAPABILITY_ERROR_CODES: Readonly<
  Record<HostPayloadCapability, readonly string[]>
> = Object.freeze({
  "project.directory.select": Object.freeze([
    "HOST_PERMISSION_DENIED",
    "HOST_CANCELLED",
    "HOST_TIMEOUT",
    "HOST_INTERNAL",
  ]),
  "project.directory.authorize": Object.freeze([
    "HOST_PERMISSION_DENIED",
    "HOST_NOT_FOUND",
    "HOST_TIMEOUT",
    "HOST_INTERNAL",
  ]),
  "project.save.atomic": Object.freeze([
    "HOST_INVALID_REQUEST",
    "HOST_NOT_FOUND",
    "HOST_CONFLICT",
    "HOST_PERMISSION_DENIED",
    "HOST_QUOTA_EXCEEDED",
    "HOST_IO_FAILURE",
    "HOST_INTEGRITY_FAILURE",
    "HOST_CANCELLED",
    "HOST_TIMEOUT",
    "HOST_INTERNAL",
  ]),
  "project.save.as": Object.freeze([
    "HOST_INVALID_REQUEST",
    "HOST_NOT_FOUND",
    "HOST_CONFLICT",
    "HOST_PERMISSION_DENIED",
    "HOST_QUOTA_EXCEEDED",
    "HOST_IO_FAILURE",
    "HOST_CANCELLED",
    "HOST_TIMEOUT",
    "HOST_INTERNAL",
  ]),
  "project.backup.create": Object.freeze([
    "HOST_PERMISSION_DENIED",
    "HOST_NOT_FOUND",
    "HOST_QUOTA_EXCEEDED",
    "HOST_IO_FAILURE",
    "HOST_TIMEOUT",
    "HOST_INTERNAL",
  ]),
  "project.backup.restore": Object.freeze([
    "HOST_PERMISSION_DENIED",
    "HOST_NOT_FOUND",
    "HOST_INTEGRITY_FAILURE",
    "HOST_IO_FAILURE",
    "HOST_TIMEOUT",
    "HOST_INTERNAL",
  ]),
  "file.export.write": Object.freeze([
    "HOST_INVALID_REQUEST",
    "HOST_NOT_FOUND",
    "HOST_CONFLICT",
    "HOST_PERMISSION_DENIED",
    "HOST_QUOTA_EXCEEDED",
    "HOST_IO_FAILURE",
    "HOST_CANCELLED",
    "HOST_TIMEOUT",
    "HOST_INTERNAL",
  ]),
});

const PAYLOAD_CAPABILITY_TIMEOUTS: Readonly<Record<HostPayloadCapability, number>> =
  Object.freeze({
    "project.directory.select": 300000,
    "project.directory.authorize": 30000,
    "project.save.atomic": 30000,
    "project.save.as": 30000,
    "project.backup.create": 60000,
    "project.backup.restore": 60000,
    "file.export.write": 30000,
  });

function payloadDeclaration(
  name: HostPayloadCapability,
  support: PayloadSupportStatus,
  timeoutMs: number,
): Record<string, unknown> {
  if (support === "unsupported") {
    return {
      name,
      capability_version: "0.2.0",
      support_status: "unsupported",
      permission_status: "not_applicable",
      input_schema: hostPayloadSchemaId(name, "input"),
      output_schema: hostPayloadSchemaId(name, "output"),
      limits: { max_concurrent_requests: 1, timeout_ms: 300000, max_payload_bytes: 0 },
      lifecycle: "request",
      cancellation: "none",
      progress: "none",
      error_codes: ["HOST_UNSUPPORTED"],
      fallback: { strategy: "read_only", reason_code: "PB10_CAPABILITY_UNAVAILABLE" },
    };
  }
  return {
    name,
    capability_version: "0.2.0",
    support_status: support,
    permission_status: name.startsWith("project.directory") ? "prompt" : "granted",
    input_schema: hostPayloadSchemaId(name, "input"),
    output_schema: hostPayloadSchemaId(name, "output"),
    limits: {
      max_concurrent_requests: 1,
      timeout_ms: timeoutMs,
      max_payload_bytes: 67108864,
    },
    lifecycle: "request",
    cancellation: "cooperative",
    progress: "none",
    error_codes: [...PAYLOAD_CAPABILITY_ERROR_CODES[name]],
    fallback:
      support === "degraded"
        ? { strategy: "read_only", reason_code: "PB10_CAPABILITY_DEGRADED" }
        : { strategy: "none", reason_code: "PB10_IMPLEMENTED" },
  };
}

function placeholderDeclaration(name: string): Record<string, unknown> {
  return {
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
    fallback: { strategy: "read_only", reason_code: "PB10_PAYLOAD_UNFROZEN" },
  };
}

export function buildPayloadHostRegistry(
  options: PayloadHostRegistryOptions,
): HostRegistryV02 {
  const additional = new Map(
    (options.additionalDeclarations ?? []).map((declaration) => {
      const name = declaration["name"];
      if (typeof name !== "string") {
        throw new Error("Additional host declarations must name a capability.");
      }
      return [name, declaration];
    }),
  );
  const capabilities = HOST_CAPABILITIES.map((name) => {
    const override = additional.get(name);
    if (override !== undefined) {
      return override;
    }
    if (isHostPayloadCapability(name)) {
      const timeoutMs = options.timeoutMs?.[name] ?? PAYLOAD_CAPABILITY_TIMEOUTS[name];
      return payloadDeclaration(
        name,
        options.capabilitySupport?.[name] ?? "supported",
        timeoutMs,
      );
    }
    return placeholderDeclaration(name);
  });
  const candidate = {
    protocol_version: "0.2.0",
    kind: "registry",
    host_kind: options.hostKind,
    host_version: options.hostVersion,
    instance_id: options.instanceId,
    capabilities,
  };
  const validation = validateHostContract(candidate);
  if (!validation.ok || validation.value.kind !== "registry") {
    const first = validation.ok ? undefined : validation.issues[0];
    throw new Error(
      `Payload host registry failed its own contract: ${first?.code ?? "HOST_SCHEMA"}${first === undefined ? "" : `@${first.path}`}`,
    );
  }
  return validation.value as unknown as HostRegistryV02;
}
