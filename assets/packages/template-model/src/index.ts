import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

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

export function validateTemplate(input: unknown): TemplateValidationResult {
  const inspection = inspectData<TemplateIssueCode>(input, {
    classifyKey: classifyForbiddenKey,
    maxDepth: 20,
    maxNodes: 5_000,
  });
  if (!inspection.ok) {
    const code =
      inspection.kind === "custom"
        ? inspection.code
        : inspection.kind === "budget" || inspection.kind === "cycle"
          ? "TEMPLATE_BUDGET_EXCEEDED"
          : "TEMPLATE_DYNAMIC_CODE_FORBIDDEN";
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue(code, inspection.path)]),
    });
  }
  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      issue("TEMPLATE_SCHEMA", error.instancePath || "/"),
    );
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
