import Ajv2020 from "ajv/dist/2020.js";

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
  | "HOST_PLATFORM_FIELD_FORBIDDEN"
  | "HOST_PROGRESS_INVALID"
  | "HOST_REGISTRY_INCOMPLETE"
  | "HOST_REGISTRY_INCONSISTENT"
  | "HOST_SCHEMA";

export interface HostContractIssue {
  readonly code: HostContractIssueCode;
  readonly path: string;
}

export type HostContractValidationResult =
  | { readonly ok: true; readonly value: HostContractMessage }
  | { readonly ok: false; readonly issues: readonly HostContractIssue[] };

interface InspectionItem {
  readonly path: string;
  readonly value: unknown;
}

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

function escapePathSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function issue(
  code: HostContractIssueCode,
  path: string,
): HostContractIssue {
  return Object.freeze({ code, path });
}

function inspectPlatformLeak(input: unknown): readonly HostContractIssue[] {
  const stack: InspectionItem[] = [{ path: "/", value: input }];
  const seen = new WeakSet<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    if (typeof current.value === "function") {
      return Object.freeze([
        issue("HOST_PLATFORM_FIELD_FORBIDDEN", current.path),
      ]);
    }
    if (typeof current.value !== "object" || current.value === null) {
      continue;
    }
    if (seen.has(current.value)) {
      return Object.freeze([issue("HOST_SCHEMA", current.path)]);
    }
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      current.value.forEach((value, index) => {
        stack.push({
          path: `${current.path === "/" ? "" : current.path}/${index}`,
          value,
        });
      });
      continue;
    }

    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(current.value),
    )) {
      const path = `${current.path === "/" ? "" : current.path}/${escapePathSegment(key)}`;
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        return Object.freeze([issue("HOST_PLATFORM_FIELD_FORBIDDEN", path)]);
      }
      const normalizedKey = key.toLowerCase().replaceAll(/[-_\s]/gu, "");
      if (forbiddenPlatformKeys.has(normalizedKey)) {
        return Object.freeze([issue("HOST_PLATFORM_FIELD_FORBIDDEN", path)]);
      }
      const descriptorValue: unknown = descriptor.value;
      stack.push({ path, value: descriptorValue });
    }
  }
  return Object.freeze([]);
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

function validateSemantics(
  message: HostContractMessage,
): readonly HostContractIssue[] {
  if (message.kind === "registry") {
    return validateRegistry(message);
  }
  if (message.kind === "progress" && message.completed > message.total) {
    return Object.freeze([
      issue("HOST_PROGRESS_INVALID", "/completed"),
    ]);
  }
  if (message.kind === "failure" && message.error.code === "HOST_CANCELLED") {
    return Object.freeze([issue("HOST_SCHEMA", "/error/code")]);
  }
  return Object.freeze([]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach((child: unknown) => {
    deepFreeze(child);
  });
  return Object.freeze(value);
}

export function validateHostContract(
  input: unknown,
): HostContractValidationResult {
  const platformIssues = inspectPlatformLeak(input);
  if (platformIssues.length > 0) {
    return Object.freeze({ ok: false, issues: platformIssues });
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
  return Object.freeze({ ok: true, value: deepFreeze(structuredClone(input)) });
}
