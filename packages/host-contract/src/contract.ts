import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import hostSchema from "../schema/host.schema.json" with { type: "json" };
import type {
  CapabilityName,
  HostContractMessage,
  HostRegistry,
} from "./generated/host.ts";

export type * from "./generated/host.ts";

export const HOST_PROTOCOL_VERSION = "0.1.0" as const;

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
  | "HOST_PLATFORM_FIELD_FORBIDDEN"
  | "HOST_PROGRESS_UNDECLARED"
  | "HOST_PROGRESS_INVALID"
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

export type HostContractValidationResult =
  | { readonly ok: true; readonly value: HostContractMessage }
  | { readonly ok: false; readonly issues: readonly HostContractIssue[] };

const forbiddenPlatformKeys = new Set([
  "absolutepath",
  "abilitycontext",
  "arkts",
  "command",
  "electron",
  "electronipc",
  "exec",
  "filepath",
  "filesystem",
  "ipc",
  "nodeintegration",
  "path",
  "preload",
  "shell",
  "systempath",
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<HostContractMessage>(hostSchema);

function issue(code: HostContractIssueCode, path: string): HostContractIssue {
  return Object.freeze({ code, path });
}

function isUnsafePathValue(value: string): boolean {
  let decoded = value;
  let stabilized = false;
  for (let pass = 0; pass < 16; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return true;
    }
    if (next === decoded) {
      stabilized = true;
      break;
    }
    decoded = next;
  }
  if (!stabilized) {
    return true;
  }
  const containsControlCharacter = [...decoded].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  const isHttpsUrl = /^https:\/\//iu.test(decoded);
  return (
    containsControlCharacter ||
    /file:/iu.test(decoded) ||
    (!isHttpsUrl && /[A-Za-z]:(?:[\\/]|[A-Za-z0-9._-])/u.test(decoded)) ||
    /\\\\[^\\]/u.test(decoded) ||
    /(?:^|[\s=:'"(])\/(?!\/)/u.test(decoded) ||
    /(?:^|[^A-Za-z0-9])\.\.(?:[\\/]|$)/u.test(decoded)
  );
}

function validateRegistry(registry: HostRegistry): readonly HostContractIssue[] {
  const issues: HostContractIssue[] = [];
  const declarations = new Map(
    registry.capabilities.map((capability) => [capability.name, capability]),
  );

  if (
    declarations.size !== HOST_CAPABILITIES.length ||
    HOST_CAPABILITIES.some((name) => !declarations.has(name))
  ) {
    issues.push(issue("HOST_REGISTRY_INCOMPLETE", "/capabilities"));
  }

  registry.capabilities.forEach((capability, index) => {
    const path = `/capabilities/${index}`;
    const expectedInput = `wenshu.host.input.${capability.name}/0.1.0`;
    const expectedOutput = `wenshu.host.output.${capability.name}/0.1.0`;
    const unsupportedIsConsistent =
      capability.support_status !== "unsupported" ||
      (capability.permission_status === "not_applicable" &&
        capability.cancellation === "none" &&
        capability.progress === "none" &&
        capability.error_codes.includes("HOST_UNSUPPORTED"));
    const degradedHasFallback =
      capability.support_status !== "degraded" ||
      capability.fallback.strategy !== "none";

    if (
      capability.input_schema !== expectedInput ||
      capability.output_schema !== expectedOutput ||
      !unsupportedIsConsistent ||
      !degradedHasFallback
    ) {
      issues.push(issue("HOST_REGISTRY_INCONSISTENT", path));
    }
  });
  return Object.freeze(issues);
}

function validateSemantics(message: HostContractMessage): readonly HostContractIssue[] {
  if (message.kind === "registry") {
    return validateRegistry(message);
  }
  if (message.kind === "progress" && message.completed > message.total) {
    return Object.freeze([issue("HOST_PROGRESS_INVALID", "/completed")]);
  }
  if (message.kind === "failure" && message.error.code === "HOST_CANCELLED") {
    return Object.freeze([issue("HOST_SCHEMA", "/error/code")]);
  }
  return Object.freeze([]);
}

export function validateHostContract(input: unknown): HostContractValidationResult {
  const inspection = inspectData<"platform">(input, {
    classifyKey: (key) => (forbiddenPlatformKeys.has(key) ? "platform" : undefined),
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
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      issue("HOST_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const semanticIssues = validateSemantics(input);
  if (semanticIssues.length > 0) {
    return Object.freeze({ ok: false, issues: semanticIssues });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
