import {
  HOST_CAPABILITIES,
  HOST_PROTOCOL_VERSION_V0_2,
  HOST_PROTOCOL_VERSION_V0_3,
  validateHostContract,
} from "./contract.ts";
import type { HostRegistry as HostRegistryV02 } from "./generated/host-0.2.0.ts";
import type { HostRegistry as HostRegistryV03 } from "./generated/host-0.3.0.ts";
import {
  hostPayloadSchemaId,
  hostPayloadSchemaIdV03,
  isHostPayloadCapability,
  isHostPayloadCapabilityV03,
  type HostPayloadCapability,
  type HostPayloadCapabilityV03,
} from "./payloads.ts";

export type PayloadSupportStatus = "supported" | "degraded" | "unsupported";

export interface PayloadHostRegistryOptions {
  readonly hostKind: "browser" | "electron" | "arkweb";
  readonly hostVersion: string;
  readonly instanceId: string;
  /** Defaults to "supported" for every frozen payload capability (0.2.0 and 0.3.0 sets). */
  readonly capabilitySupport?: Partial<
    Readonly<
      Record<HostPayloadCapability | HostPayloadCapabilityV03, PayloadSupportStatus>
    >
  >;
  /** Additional declarations for capabilities outside the PB-10 frozen set (for example print.pdf.export). */
  readonly additionalDeclarations?: readonly Record<string, unknown>[];
  /** Per-capability timeout overrides; applied identically to declarations and enforcement. */
  readonly timeoutMs?: Partial<
    Readonly<Record<HostPayloadCapability | HostPayloadCapabilityV03, number>>
  >;
  /**
   * Legacy opt-out: build the frozen 0.2.0 registry shape in which
   * file.import.select is still a 0.1.0 placeholder. The default builds the
   * latest 0.3.0 registry (ADR-0029).
   */
  readonly payloadRegistryVersion?: "0.2.0";
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

const PAYLOAD_CAPABILITY_V0_3_ERROR_CODES: Readonly<
  Record<HostPayloadCapabilityV03, readonly string[]>
> = Object.freeze({
  // Mirrors the project.directory.select picker entry (ADR-0029), plus
  // HOST_INVALID_REQUEST: the handler can reject malformed shell selections
  // (non-file, oversized, relative path) and a missing dialog injection.
  "file.import.select": Object.freeze([
    "HOST_INVALID_REQUEST",
    "HOST_PERMISSION_DENIED",
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

const PAYLOAD_CAPABILITY_V0_3_TIMEOUTS: Readonly<
  Record<HostPayloadCapabilityV03, number>
> = Object.freeze({
  "file.import.select": 300000,
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

function payloadDeclarationV03(
  name: HostPayloadCapabilityV03,
  support: PayloadSupportStatus,
  timeoutMs: number,
): Record<string, unknown> {
  if (support === "unsupported") {
    return {
      name,
      capability_version: HOST_PROTOCOL_VERSION_V0_3,
      support_status: "unsupported",
      permission_status: "not_applicable",
      input_schema: hostPayloadSchemaIdV03(name, "input"),
      output_schema: hostPayloadSchemaIdV03(name, "output"),
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
    capability_version: HOST_PROTOCOL_VERSION_V0_3,
    support_status: support,
    permission_status: "prompt",
    input_schema: hostPayloadSchemaIdV03(name, "input"),
    output_schema: hostPayloadSchemaIdV03(name, "output"),
    limits: {
      max_concurrent_requests: 1,
      timeout_ms: timeoutMs,
      max_payload_bytes: 67108864,
    },
    lifecycle: "request",
    cancellation: "cooperative",
    progress: "none",
    error_codes: [...PAYLOAD_CAPABILITY_V0_3_ERROR_CODES[name]],
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

const KNOWN_OPTION_KEYS: ReadonlySet<string> = new Set([
  "hostKind",
  "hostVersion",
  "instanceId",
  "capabilitySupport",
  "additionalDeclarations",
  "timeoutMs",
  "payloadRegistryVersion",
]);

export function buildPayloadHostRegistry(
  options: PayloadHostRegistryOptions & { readonly payloadRegistryVersion: "0.2.0" },
): HostRegistryV02;
export function buildPayloadHostRegistry(
  options: PayloadHostRegistryOptions,
): HostRegistryV03;
export function buildPayloadHostRegistry(
  options: PayloadHostRegistryOptions,
): HostRegistryV02 | HostRegistryV03 {
  // Fail-closed on unknown option keys (A-02 audit MAJOR-1 remediation): a
  // caller intending the legacy 0.2.0 shape who mistypes the option name
  // (e.g. protocolVersion) must get an explicit error, never a silent
  // latest-version registry advertising capabilities it did not ask about.
  // `for...in` (not Object.keys): keys on the prototype chain are equally
  // capable of silently carrying a misspelled option (audit MINOR-2).
  for (const key in options) {
    if (!KNOWN_OPTION_KEYS.has(key)) {
      throw new Error(`Unknown payload registry option: ${key}`);
    }
  }
  // Fail-closed on the value axis too (A-02 audit MINOR-1): a legal key with
  // an illegal value (e.g. payloadRegistryVersion: "0.1.0" from a JS caller,
  // JSON config, or an `as` assertion) must throw, never silently build the
  // latest-version registry. Type-level literals cannot guard runtime input.
  if (
    options.payloadRegistryVersion !== undefined &&
    options.payloadRegistryVersion !== "0.2.0"
  ) {
    throw new Error(
      `Unknown payload registry version: ${String(options.payloadRegistryVersion)}`,
    );
  }
  const registryVersion =
    options.payloadRegistryVersion === "0.2.0"
      ? HOST_PROTOCOL_VERSION_V0_2
      : HOST_PROTOCOL_VERSION_V0_3;
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
    if (
      registryVersion === HOST_PROTOCOL_VERSION_V0_3 &&
      isHostPayloadCapabilityV03(name)
    ) {
      const timeoutMs =
        options.timeoutMs?.[name] ?? PAYLOAD_CAPABILITY_V0_3_TIMEOUTS[name];
      return payloadDeclarationV03(
        name,
        options.capabilitySupport?.[name] ?? "supported",
        timeoutMs,
      );
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
    protocol_version: registryVersion,
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
  return validation.value as unknown as HostRegistryV02 | HostRegistryV03;
}
