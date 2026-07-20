import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import contractSchema from "../schema/project-contract.schema.json" with {
  type: "json",
};
import type {
  KnowledgePackageManifest,
  ProjectContract,
  ProjectManifest,
  SemanticAuditEvent,
} from "./generated/project-contract.ts";

export const PROJECT_CONTRACT_VERSION = "0.1.0" as const;

export type ProjectContractIssueCode =
  | "PROJECT_BUDGET_EXCEEDED"
  | "PROJECT_DUPLICATE_ID"
  | "PROJECT_INTEGRITY"
  | "PROJECT_REFERENCE_MISSING"
  | "PROJECT_SCHEMA"
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

function issue(
  code: ProjectContractIssueCode,
  path: string,
): ProjectContractIssue {
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
  if (
    duplicates(
      project.formal_versions.map((entry) => entry.approval_event_id),
    )
  ) {
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
      issues.push(
        issue("PROJECT_REFERENCE_MISSING", `/derived_data/${index}`),
      );
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
    if (
      (truthRole &&
        (entry.classification !== "truth" ||
          !entry.required ||
          entry.rebuildable)) ||
      (!truthRole &&
        (entry.classification !== "derived" ||
          entry.required ||
          !entry.rebuildable))
    ) {
      issues.push(
        issue("PROJECT_TRUTH_DERIVED_MIXED", `/entries/${index}`),
      );
    }
  });
  return Object.freeze(issues);
}

function validateAudit(event: SemanticAuditEvent): readonly ProjectContractIssue[] {
  const issues: ProjectContractIssue[] = [];
  if ((event.actor === "ai") !== (event.model_context !== null)) {
    issues.push(issue("PROJECT_INTEGRITY", "/model_context"));
  }
  if (event.action === "source_linked" && event.source_refs.length === 0) {
    issues.push(issue("PROJECT_REFERENCE_MISSING", "/source_refs"));
  }
  const expectedDecision = {
    ai_change_decided: ["accepted", "rejected"],
    user_changed_after_ai: ["applied"],
    source_linked: ["applied"],
    template_applied: ["applied"],
    formal_version_approved: ["approved"],
  }[event.action];
  if (!expectedDecision.includes(event.decision)) {
    issues.push(issue("PROJECT_INTEGRITY", "/decision"));
  }
  return Object.freeze(issues);
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
      return Object.freeze([]);
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
          inspection.kind === "budget"
            ? "PROJECT_BUDGET_EXCEEDED"
            : "PROJECT_SCHEMA",
          inspection.path,
        ),
      ]),
    });
  }
  if (!validateShape(input)) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(
        (validateShape.errors ?? []).map((entry) =>
          issue("PROJECT_SCHEMA", entry.instancePath || "/"),
        ),
      ),
    });
  }
  const issues = semanticIssues(input);
  if (issues.length > 0) {
    return Object.freeze({ ok: false, issues });
  }
  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
