import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";
import { DOCUMENT_SCHEMA_VERSION } from "@wenshu/document-model";
import { TEMPLATE_DSL_VERSION } from "@wenshu/template-model";

import contractSchema from "../schema/project-contract.schema.json" with { type: "json" };
import type {
  KnowledgePackageManifest,
  ProjectContract,
  ProjectManifest,
} from "./generated/project-contract.ts";
import {
  isCanonicalTimestamp,
  validateAudit,
  validateModelIdentifierInput,
} from "./audit-semantics.ts";

export const PROJECT_CONTRACT_VERSION = "0.1.0" as const;
export const PROJECT_UPSTREAM_VERSIONS = Object.freeze({
  document: DOCUMENT_SCHEMA_VERSION,
  template: TEMPLATE_DSL_VERSION,
});

export type ProjectContractIssueCode =
  | "PROJECT_AUDIT_DECISION_INVALID"
  | "PROJECT_AUDIT_HASH_INVALID"
  | "PROJECT_AUDIT_RESPONSIBILITY_INVALID"
  | "PROJECT_BUDGET_EXCEEDED"
  | "PROJECT_COMPATIBILITY_MISMATCH"
  | "PROJECT_DUPLICATE_ID"
  | "PROJECT_MODEL_IDENTIFIER_INVALID"
  | "PROJECT_PACKAGE_PATH_INVALID"
  | "PROJECT_REFERENCE_MISSING"
  | "PROJECT_SCHEMA"
  | "PROJECT_TIMESTAMP_INVALID"
  | "PROJECT_TRUTH_DERIVED_MIXED";

export interface ProjectContractIssue {
  readonly code: ProjectContractIssueCode;
  readonly path: string;
}

export type ProjectContractValidationResult =
  | { readonly ok: true; readonly value: ProjectContract }
  | { readonly ok: false; readonly issues: readonly ProjectContractIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<ProjectContract>(contractSchema);

function issue(code: ProjectContractIssueCode, path: string): ProjectContractIssue {
  return Object.freeze({ code, path });
}

function duplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function validateProject(project: ProjectManifest): readonly ProjectContractIssue[] {
  const issues: ProjectContractIssue[] = [];
  if (duplicates(project.materials.map((entry) => entry.material_id))) {
    issues.push(issue("PROJECT_DUPLICATE_ID", "/materials"));
  }
  if (duplicates(project.formal_versions.map((entry) => entry.version_id))) {
    issues.push(issue("PROJECT_DUPLICATE_ID", "/formal_versions"));
  }
  if (duplicates(project.formal_versions.map((entry) => entry.approval_event_id))) {
    issues.push(issue("PROJECT_DUPLICATE_ID", "/formal_versions"));
  }
  const auditIds = new Set(project.semantic_audit_event_ids);
  const truthHashes = new Set([
    project.document.sha256,
    project.template.sha256,
    ...project.materials.map((entry) => entry.sha256),
    ...project.formal_versions.flatMap((entry) => [
      entry.document_sha256,
      entry.template_sha256,
    ]),
  ]);
  project.formal_versions.forEach((entry, index) => {
    if (!isCanonicalTimestamp(entry.created_at)) {
      issues.push(
        issue("PROJECT_TIMESTAMP_INVALID", `/formal_versions/${index}/created_at`),
      );
    }
    if (!auditIds.has(entry.approval_event_id)) {
      issues.push(
        issue(
          "PROJECT_REFERENCE_MISSING",
          `/formal_versions/${index}/approval_event_id`,
        ),
      );
    }
  });
  project.derived_data.forEach((entry, index) => {
    if (entry.source_sha256s.some((sha256) => !truthHashes.has(sha256))) {
      issues.push(issue("PROJECT_REFERENCE_MISSING", `/derived_data/${index}`));
    }
  });
  return Object.freeze(issues);
}

function validatePackage(
  manifest: KnowledgePackageManifest,
): readonly ProjectContractIssue[] {
  const issues: ProjectContractIssue[] = [];
  if (duplicates(manifest.entries.map((entry) => entry.path))) {
    issues.push(issue("PROJECT_DUPLICATE_ID", "/entries"));
  }
  if (!isCanonicalTimestamp(manifest.created_at)) {
    issues.push(issue("PROJECT_TIMESTAMP_INVALID", "/created_at"));
  }
  const requiredSingletons = ["truth.project", "truth.audit"] as const;
  requiredSingletons.forEach((role) => {
    if (manifest.entries.filter((entry) => entry.role === role).length !== 1) {
      issues.push(issue("PROJECT_REFERENCE_MISSING", `/entries/${role}`));
    }
  });
  if (!manifest.entries.some((entry) => entry.role === "truth.document")) {
    issues.push(issue("PROJECT_REFERENCE_MISSING", "/entries/truth.document"));
  }
  if (!manifest.entries.some((entry) => entry.role === "truth.template")) {
    issues.push(issue("PROJECT_REFERENCE_MISSING", "/entries/truth.template"));
  }
  manifest.entries.forEach((entry, index) => {
    const truthRole = entry.role.startsWith("truth.");
    const expectedPrefix = truthRole ? "truth/" : "derived/";
    if (
      (truthRole &&
        (entry.classification !== "truth" || !entry.required || entry.rebuildable)) ||
      (!truthRole &&
        (entry.classification !== "derived" || entry.required || !entry.rebuildable))
    ) {
      issues.push(issue("PROJECT_TRUTH_DERIVED_MIXED", `/entries/${index}`));
    }
    if (!entry.path.startsWith(expectedPrefix)) {
      issues.push(issue("PROJECT_PACKAGE_PATH_INVALID", `/entries/${index}/path`));
    }
  });
  return Object.freeze(issues);
}

function validateCompatibility(
  value: Extract<ProjectContract, { contract_kind: "compatibility" }>,
): readonly ProjectContractIssue[] {
  if (
    value.readers.document !== PROJECT_UPSTREAM_VERSIONS.document ||
    value.readers.template !== PROJECT_UPSTREAM_VERSIONS.template
  ) {
    return Object.freeze([issue("PROJECT_COMPATIBILITY_MISMATCH", "/readers")]);
  }
  return Object.freeze([]);
}

function semanticIssues(value: ProjectContract): readonly ProjectContractIssue[] {
  switch (value.contract_kind) {
    case "project":
      return validateProject(value);
    case "knowledge_package":
      return validatePackage(value);
    case "semantic_audit_event":
      return validateAudit(value);
    case "compatibility":
      return validateCompatibility(value);
  }
}

export function validateProjectContract(
  input: unknown,
): ProjectContractValidationResult {
  const inspection = inspectData(input, { maxDepth: 64, maxNodes: 100_000 });
  if (!inspection.ok) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          inspection.kind === "budget" ? "PROJECT_BUDGET_EXCEEDED" : "PROJECT_SCHEMA",
          inspection.path,
        ),
      ]),
    });
  }
  const identifierIssues = validateModelIdentifierInput(input);
  if (identifierIssues.length > 0) {
    return Object.freeze({ ok: false, issues: identifierIssues });
  }
  if (!validateShape(input)) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(
        (validateShape.errors ?? []).map((entry) => {
          const missingProperty = entry.params["missingProperty"];
          const path =
            entry.keyword === "required" && typeof missingProperty === "string"
              ? `${entry.instancePath}/${missingProperty.replaceAll("~", "~0").replaceAll("/", "~1")}`
              : entry.instancePath || "/";
          return issue("PROJECT_SCHEMA", path);
        }),
      ),
    });
  }
  const issues = semanticIssues(input);
  if (issues.length > 0) {
    return Object.freeze({ ok: false, issues });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
