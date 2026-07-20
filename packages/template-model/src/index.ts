import Ajv2020 from "ajv/dist/2020.js";

import templateSchema from "../schema/template.schema.json" with { type: "json" };
import type { WenshuTemplate } from "./generated/template.ts";

export type * from "./generated/template.ts";

export const TEMPLATE_DSL_VERSION = "0.1.0" as const;

export type TemplateIssueCode =
  | "TEMPLATE_BUDGET_EXCEEDED"
  | "TEMPLATE_CAPABILITY_FORBIDDEN"
  | "TEMPLATE_DYNAMIC_CODE_FORBIDDEN"
  | "TEMPLATE_FILE_ACCESS_FORBIDDEN"
  | "TEMPLATE_NETWORK_ACCESS_FORBIDDEN"
  | "TEMPLATE_SCHEMA";

export interface TemplateIssue {
  readonly code: TemplateIssueCode;
  readonly path: string;
}

export type TemplateValidationResult =
  | { readonly ok: true; readonly value: WenshuTemplate }
  | { readonly ok: false; readonly issues: readonly TemplateIssue[] };

interface InspectionItem {
  readonly depth: number;
  readonly path: string;
  readonly value: unknown;
}

const MAX_INPUT_DEPTH = 20;
const MAX_INPUT_NODES = 5_000;

const dynamicCodeKeys = new Set([
  "code",
  "command",
  "commands",
  "eval",
  "exec",
  "expression",
  "function",
  "functions",
  "javascript",
  "process",
  "script",
  "scripts",
  "shell",
  "spawn",
]);
const fileAccessKeys = new Set([
  "directory",
  "directories",
  "file",
  "files",
  "filepath",
  "filename",
  "filesystem",
  "glob",
  "path",
  "paths",
  "symlink",
]);
const networkAccessKeys = new Set([
  "endpoint",
  "endpoints",
  "fetch",
  "http",
  "https",
  "network",
  "networks",
  "socket",
  "uri",
  "url",
  "webhook",
]);
const capabilityKeys = new Set([
  "capabilities",
  "capability",
  "permission",
  "permissions",
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<WenshuTemplate>(templateSchema);

function escapePathSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function issue(code: TemplateIssueCode, path: string): TemplateIssue {
  return Object.freeze({ code, path });
}

function classifyForbiddenKey(normalizedKey: string): TemplateIssueCode | undefined {
  if (dynamicCodeKeys.has(normalizedKey)) {
    return "TEMPLATE_DYNAMIC_CODE_FORBIDDEN";
  }
  if (fileAccessKeys.has(normalizedKey)) {
    return "TEMPLATE_FILE_ACCESS_FORBIDDEN";
  }
  if (networkAccessKeys.has(normalizedKey)) {
    return "TEMPLATE_NETWORK_ACCESS_FORBIDDEN";
  }
  if (capabilityKeys.has(normalizedKey)) {
    return "TEMPLATE_CAPABILITY_FORBIDDEN";
  }
  return undefined;
}

function inspectSecurity(input: unknown): readonly TemplateIssue[] {
  const stack: InspectionItem[] = [{ depth: 0, path: "/", value: input }];
  const seen = new WeakSet<object>();
  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    if (typeof current.value === "function") {
      return Object.freeze([
        issue("TEMPLATE_DYNAMIC_CODE_FORBIDDEN", current.path),
      ]);
    }
    if (typeof current.value !== "object" || current.value === null) {
      continue;
    }
    visitedNodes += 1;
    if (visitedNodes > MAX_INPUT_NODES || current.depth > MAX_INPUT_DEPTH) {
      return Object.freeze([issue("TEMPLATE_BUDGET_EXCEEDED", current.path)]);
    }
    if (seen.has(current.value)) {
      return Object.freeze([issue("TEMPLATE_BUDGET_EXCEEDED", current.path)]);
    }
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      current.value.forEach((value, index) => {
        stack.push({
          depth: current.depth + 1,
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
        return Object.freeze([
          issue("TEMPLATE_DYNAMIC_CODE_FORBIDDEN", path),
        ]);
      }
      const normalizedKey = key.toLowerCase().replaceAll(/[-_\s]/gu, "");
      const forbiddenCode = classifyForbiddenKey(normalizedKey);
      if (forbiddenCode !== undefined) {
        return Object.freeze([issue(forbiddenCode, path)]);
      }
      const descriptorValue: unknown = descriptor.value;
      stack.push({ depth: current.depth + 1, path, value: descriptorValue });
    }
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

export function validateTemplate(input: unknown): TemplateValidationResult {
  const securityIssues = inspectSecurity(input);
  if (securityIssues.length > 0) {
    return Object.freeze({ ok: false, issues: securityIssues });
  }
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      issue("TEMPLATE_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  return Object.freeze({ ok: true, value: deepFreeze(structuredClone(input)) });
}
