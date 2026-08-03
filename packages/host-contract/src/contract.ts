import Ajv2020 from "ajv/dist/2020.js";

import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import hostSchema from "../schema/host.schema.json" with { type: "json" };
import hostSchemaV02 from "../schema/host-0.2.0.schema.json" with { type: "json" };
import hostSchemaV03 from "../schema/host-0.3.0.schema.json" with { type: "json" };
import type {
  CapabilityName,
  HostContractMessage,
  HostRegistry,
} from "./generated/host.ts";
import type {
  HostContractMessageV02,
  HostRegistry as HostRegistryV02,
} from "./generated/host-0.2.0.ts";
import type {
  HostContractMessageV03,
  HostRegistry as HostRegistryV03,
} from "./generated/host-0.3.0.ts";
import {
  HOST_PAYLOAD_PROTOCOL_VERSION,
  HOST_PAYLOAD_PROTOCOL_VERSION_V0_3,
  hostPayloadSchemaId,
  hostPayloadSchemaIdV03,
  isHostPayloadCapability,
  isHostPayloadCapabilityV03,
  validateHostPayload,
} from "./payloads.ts";
import { isForbiddenPlatformKey, isUnsafePathValue } from "./security.ts";

export type * from "./generated/host.ts";
export type * as v02 from "./generated/host-0.2.0.ts";
export type * as v03 from "./generated/host-0.3.0.ts";

export const HOST_PROTOCOL_VERSION = "0.1.0" as const;
export const HOST_PROTOCOL_VERSION_V0_2 = HOST_PAYLOAD_PROTOCOL_VERSION;
export const HOST_PROTOCOL_VERSION_V0_3 = HOST_PAYLOAD_PROTOCOL_VERSION_V0_3;
export const HOST_PROTOCOL_VERSIONS = [
  HOST_PROTOCOL_VERSION,
  HOST_PROTOCOL_VERSION_V0_2,
  HOST_PROTOCOL_VERSION_V0_3,
] as const;

export const HOST_CAPABILITIES = [
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
] as const satisfies readonly CapabilityName[];

export type HostContractIssueCode =
  | "HOST_BUDGET_EXCEEDED"
  | "HOST_CANCELLATION_UNDECLARED"
  | "HOST_CAPABILITY_MISMATCH"
  | "HOST_CAPABILITY_UNSUPPORTED"
  | "HOST_ERROR_CODE_UNDECLARED"
  | "HOST_PAYLOAD_SCHEMA"
  | "HOST_PAYLOAD_SCHEMA_UNKNOWN"
  | "HOST_PLATFORM_FIELD_FORBIDDEN"
  | "HOST_PROGRESS_INVALID"
  | "HOST_PROGRESS_UNDECLARED"
  | "HOST_REGISTRY_INCOMPLETE"
  | "HOST_REGISTRY_INCONSISTENT"
  | "HOST_REQUEST_DUPLICATE"
  | "HOST_REQUEST_UNKNOWN"
  | "HOST_SCHEMA"
  | "HOST_SEQUENCE_REGRESSION"
  | "HOST_TERMINAL_STATE_DUPLICATE"
  | "HOST_TERMINAL_STATE_MISSING";

export interface HostContractIssue {
  readonly code: HostContractIssueCode;
  readonly path: string;
}

export type HostContractValidatedMessage =
  HostContractMessage | HostContractMessageV02 | HostContractMessageV03;

export type HostContractValidationResult =
  | { readonly ok: true; readonly value: HostContractValidatedMessage }
  | { readonly ok: false; readonly issues: readonly HostContractIssue[] };

const ajvV01 = new Ajv2020({ allErrors: true, strict: true });
const validateShapeV01 = ajvV01.compile<HostContractMessage>(hostSchema);
const ajvV02 = new Ajv2020({ allErrors: true, strict: true });
const validateShapeV02 = ajvV02.compile<HostContractMessageV02>(hostSchemaV02);
const ajvV03 = new Ajv2020({ allErrors: true, strict: true });
const validateShapeV03 = ajvV03.compile<HostContractMessageV03>(hostSchemaV03);

function issue(code: HostContractIssueCode, path: string): HostContractIssue {
  return Object.freeze({ code, path });
}

type RegistryCapability =
  | HostRegistry["capabilities"][number]
  | HostRegistryV02["capabilities"][number]
  | HostRegistryV03["capabilities"][number];

function validateDeclarationConsistency(
  capability: RegistryCapability,
  path: string,
  issues: HostContractIssue[],
): void {
  const unsupportedIsConsistent =
    capability.support_status !== "unsupported" ||
    (capability.permission_status === "not_applicable" &&
      capability.cancellation === "none" &&
      capability.progress === "none" &&
      capability.error_codes.includes("HOST_UNSUPPORTED"));
  const degradedHasFallback =
    capability.support_status !== "degraded" || capability.fallback.strategy !== "none";

  if (capability.capability_version === HOST_PAYLOAD_PROTOCOL_VERSION_V0_3) {
    const name: string = capability.name;
    if (!isHostPayloadCapabilityV03(name)) {
      issues.push(issue("HOST_REGISTRY_INCONSISTENT", path));
      return;
    }
    if (
      capability.input_schema !== hostPayloadSchemaIdV03(name, "input") ||
      capability.output_schema !== hostPayloadSchemaIdV03(name, "output")
    ) {
      issues.push(issue("HOST_REGISTRY_INCONSISTENT", path));
      return;
    }
  } else if (capability.capability_version === HOST_PAYLOAD_PROTOCOL_VERSION) {
    const name: string = capability.name;
    if (!isHostPayloadCapability(name)) {
      issues.push(issue("HOST_REGISTRY_INCONSISTENT", path));
      return;
    }
    if (
      capability.input_schema !== hostPayloadSchemaId(name, "input") ||
      capability.output_schema !== hostPayloadSchemaId(name, "output")
    ) {
      issues.push(issue("HOST_REGISTRY_INCONSISTENT", path));
      return;
    }
  } else {
    const expectedInput = `wenshu.host.input.${capability.name}/0.1.0`;
    const expectedOutput = `wenshu.host.output.${capability.name}/0.1.0`;
    if (
      capability.input_schema !== expectedInput ||
      capability.output_schema !== expectedOutput
    ) {
      issues.push(issue("HOST_REGISTRY_INCONSISTENT", path));
      return;
    }
  }

  if (!unsupportedIsConsistent || !degradedHasFallback) {
    issues.push(issue("HOST_REGISTRY_INCONSISTENT", path));
  }
}

function validateRegistry(
  registry: HostRegistry | HostRegistryV02 | HostRegistryV03,
): readonly HostContractIssue[] {
  const issues: HostContractIssue[] = [];
  const capabilities: readonly RegistryCapability[] = registry.capabilities;
  const declarations = new Map(
    capabilities.map((capability) => [capability.name, capability]),
  );

  if (
    declarations.size !== HOST_CAPABILITIES.length ||
    HOST_CAPABILITIES.some((name) => !declarations.has(name))
  ) {
    issues.push(issue("HOST_REGISTRY_INCOMPLETE", "/capabilities"));
  }

  capabilities.forEach((capability, index) => {
    validateDeclarationConsistency(capability, `/capabilities/${index}`, issues);
  });
  return Object.freeze(issues);
}

function validateSharedSemantics(
  message: HostContractValidatedMessage,
): readonly HostContractIssue[] {
  if (message.kind === "progress" && message.completed > message.total) {
    return Object.freeze([issue("HOST_PROGRESS_INVALID", "/completed")]);
  }
  if (message.kind === "failure" && message.error.code === "HOST_CANCELLED") {
    return Object.freeze([issue("HOST_SCHEMA", "/error/code")]);
  }
  return Object.freeze([]);
}

/**
 * Deep payload validation for requests that declare a frozen concrete payload
 * version (0.2.0 or 0.3.0). Legacy 0.1.0 declarations carry no entity schema
 * and skip deep validation, matching the frozen 0.1.0/0.2.0 semantics.
 */
function validatePayloadRequestSemantics(
  capabilityVersion: string,
  capability: string,
  input: unknown,
): readonly HostContractIssue[] {
  let payloadSchemaId: string | undefined;
  if (capabilityVersion === HOST_PAYLOAD_PROTOCOL_VERSION) {
    if (!isHostPayloadCapability(capability)) {
      return Object.freeze([issue("HOST_CAPABILITY_MISMATCH", "/capability")]);
    }
    payloadSchemaId = hostPayloadSchemaId(capability, "input");
  } else if (capabilityVersion === HOST_PAYLOAD_PROTOCOL_VERSION_V0_3) {
    if (!isHostPayloadCapabilityV03(capability)) {
      return Object.freeze([issue("HOST_CAPABILITY_MISMATCH", "/capability")]);
    }
    payloadSchemaId = hostPayloadSchemaIdV03(capability, "input");
  }
  if (payloadSchemaId === undefined) {
    return Object.freeze([]);
  }
  const payload = validateHostPayload(payloadSchemaId, input);
  if (!payload.ok) {
    return Object.freeze(
      payload.issues.map((entry) =>
        issue(entry.code, `/input${entry.path === "/" ? "" : entry.path}`),
      ),
    );
  }
  return Object.freeze([]);
}

function validateSemanticsV02(
  message: HostContractMessageV02,
): readonly HostContractIssue[] {
  if (message.kind === "registry") {
    return validateRegistry(message);
  }
  const shared = validateSharedSemantics(message);
  if (shared.length > 0) {
    return shared;
  }
  if (message.kind === "request") {
    return validatePayloadRequestSemantics(
      message.capability_version,
      message.capability,
      message.input,
    );
  }
  return Object.freeze([]);
}

function validateSemanticsV03(
  message: HostContractMessageV03,
): readonly HostContractIssue[] {
  if (message.kind === "registry") {
    return validateRegistry(message);
  }
  const shared = validateSharedSemantics(message);
  if (shared.length > 0) {
    return shared;
  }
  if (message.kind === "request") {
    return validatePayloadRequestSemantics(
      message.capability_version,
      message.capability,
      message.input,
    );
  }
  return Object.freeze([]);
}

function validateSemanticsV01(
  message: HostContractMessage,
): readonly HostContractIssue[] {
  if (message.kind === "registry") {
    return validateRegistry(message);
  }
  return validateSharedSemantics(message);
}

function readProtocolVersion(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, "protocol_version");
  if (descriptor === undefined || typeof descriptor.value !== "string") {
    return undefined;
  }
  return descriptor.value;
}

export function validateHostContract(input: unknown): HostContractValidationResult {
  const inspection = inspectData<"platform">(input, {
    classifyKey: (key) => (isForbiddenPlatformKey(key) ? "platform" : undefined),
    classifyString: (value) => (isUnsafePathValue(value) ? "platform" : undefined),
    maxDepth: 32,
    maxNodes: 10_000,
  });
  if (!inspection.ok) {
    const code =
      inspection.kind === "budget"
        ? "HOST_BUDGET_EXCEEDED"
        : inspection.kind === "cycle"
          ? "HOST_SCHEMA"
          : "HOST_PLATFORM_FIELD_FORBIDDEN";
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue(code, inspection.path)]),
    });
  }
  if (readProtocolVersion(input) === HOST_PROTOCOL_VERSION_V0_3) {
    if (!validateShapeV03(input)) {
      const issues = (validateShapeV03.errors ?? []).map((error) =>
        issue("HOST_SCHEMA", error.instancePath || "/"),
      );
      return Object.freeze({ ok: false, issues: Object.freeze(issues) });
    }
    const semanticIssues = validateSemanticsV03(input);
    if (semanticIssues.length > 0) {
      return Object.freeze({ ok: false, issues: semanticIssues });
    }
    return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
  }
  if (readProtocolVersion(input) === HOST_PROTOCOL_VERSION_V0_2) {
    if (!validateShapeV02(input)) {
      const issues = (validateShapeV02.errors ?? []).map((error) =>
        issue("HOST_SCHEMA", error.instancePath || "/"),
      );
      return Object.freeze({ ok: false, issues: Object.freeze(issues) });
    }
    const semanticIssues = validateSemanticsV02(input);
    if (semanticIssues.length > 0) {
      return Object.freeze({ ok: false, issues: semanticIssues });
    }
    return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
  }
  if (!validateShapeV01(input)) {
    const issues = (validateShapeV01.errors ?? []).map((error) =>
      issue("HOST_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const semanticIssues = validateSemanticsV01(input);
  if (semanticIssues.length > 0) {
    return Object.freeze({ ok: false, issues: semanticIssues });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
