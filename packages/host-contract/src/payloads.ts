import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

import { inspectData } from "@wenshu/contract-runtime";

import payloadsSchema from "../schema/host-payloads-0.2.0.schema.json" with { type: "json" };
import type { HostContractIssue, HostContractIssueCode } from "./contract.ts";
import { isForbiddenPlatformKey, isUnsafePathValue } from "./security.ts";

export const HOST_PAYLOAD_PROTOCOL_VERSION = "0.2.0" as const;

export const HOST_PAYLOAD_CAPABILITIES = [
  "project.directory.select",
  "project.directory.authorize",
  "project.save.atomic",
  "project.save.as",
  "project.backup.create",
  "project.backup.restore",
  "file.export.write",
] as const;

export type HostPayloadCapability = (typeof HOST_PAYLOAD_CAPABILITIES)[number];
export type HostPayloadKind = "input" | "output";

const PAYLOAD_DEFINITION_NAMES: Readonly<
  Record<HostPayloadCapability, Readonly<Record<HostPayloadKind, string>>>
> = Object.freeze({
  "project.directory.select": Object.freeze({
    input: "ProjectDirectorySelectInput",
    output: "ProjectDirectorySelectOutput",
  }),
  "project.directory.authorize": Object.freeze({
    input: "ProjectDirectoryAuthorizeInput",
    output: "ProjectDirectoryAuthorizeOutput",
  }),
  "project.save.atomic": Object.freeze({
    input: "ProjectSaveAtomicInput",
    output: "ProjectSaveAtomicOutput",
  }),
  "project.save.as": Object.freeze({
    input: "ProjectSaveAsInput",
    output: "ProjectSaveAsOutput",
  }),
  "project.backup.create": Object.freeze({
    input: "ProjectBackupCreateInput",
    output: "ProjectBackupCreateOutput",
  }),
  "project.backup.restore": Object.freeze({
    input: "ProjectBackupRestoreInput",
    output: "ProjectBackupRestoreOutput",
  }),
  "file.export.write": Object.freeze({
    input: "FileExportWriteInput",
    output: "FileExportWriteOutput",
  }),
});

export function isHostPayloadCapability(name: string): name is HostPayloadCapability {
  return (HOST_PAYLOAD_CAPABILITIES as readonly string[]).includes(name);
}

export function hostPayloadSchemaId(
  capability: HostPayloadCapability,
  kind: HostPayloadKind,
): string {
  return `wenshu.host.${kind}.${capability}/${HOST_PAYLOAD_PROTOCOL_VERSION}`;
}

function issue(code: HostContractIssueCode, path: string): HostContractIssue {
  return Object.freeze({ code, path });
}

/**
 * Programmatic RFC 4648 base64 check: exactly the same language as the frozen
 * pattern `^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$`
 * (groups of 4 alphabet chars, optional final `XX==` or `XXX=` group, empty
 * string allowed), but O(n) with zero backtracking. The regex form exhausted
 * the V8 RegExp stack on ~4 MiB inputs — deep inside the advertised 64 MiB
 * range — and escaped as a raw RangeError with no protocol terminal state
 * (PB-12 audit MAJOR-1). Exported for the language-equivalence tests.
 */
export function isContentBase64(value: string): boolean {
  const length = value.length;
  if (length % 4 !== 0) {
    return false;
  }
  let padding = 0;
  while (padding < length && value.charCodeAt(length - 1 - padding) === 61) {
    padding += 1;
  }
  if (padding > 2) {
    return false;
  }
  const bodyLength = length - padding;
  for (let index = 0; index < bodyLength; index += 1) {
    const code = value.charCodeAt(index);
    const inAlphabet =
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      (code >= 48 && code <= 57) || // 0-9
      code === 43 || // +
      code === 47; // /
    if (!inAlphabet) {
      return false;
    }
  }
  return true;
}

const payloadsSchemaId = payloadsSchema.$id;
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("content-base64", { type: "string", validate: isContentBase64 });
ajv.addSchema(payloadsSchema);

const validators = new Map<string, ValidateFunction>();
for (const capability of HOST_PAYLOAD_CAPABILITIES) {
  const names = PAYLOAD_DEFINITION_NAMES[capability];
  for (const kind of ["input", "output"] as const) {
    const schemaId = hostPayloadSchemaId(capability, kind);
    const validator = ajv.getSchema(`${payloadsSchemaId}#/$defs/${names[kind]}`);
    if (validator === undefined) {
      throw new Error(`Host payload schema is missing: ${schemaId}`);
    }
    validators.set(schemaId, validator);
  }
}

export type HostPayloadValidationResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: readonly HostContractIssue[] };

export function validateHostPayload(
  schemaId: string,
  value: unknown,
): HostPayloadValidationResult {
  const inspection = inspectData<"platform">(value, {
    classifyKey: (key) => (isForbiddenPlatformKey(key) ? "platform" : undefined),
    classifyString: (candidate) =>
      isUnsafePathValue(candidate) ? "platform" : undefined,
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
  const validator = validators.get(schemaId);
  if (validator === undefined) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue("HOST_PAYLOAD_SCHEMA_UNKNOWN", "/")]),
    });
  }
  if (!validator(value)) {
    const issues = (validator.errors ?? []).map((error) =>
      issue("HOST_PAYLOAD_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  return Object.freeze({ ok: true, value });
}
