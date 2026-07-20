import type {
  KnowledgePackageManifest,
  SemanticAuditEvent,
} from "./generated/project-contract.ts";
import { type ProjectContractIssue, validateProjectContract } from "./validation.ts";

export type KnowledgeBundleValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ProjectContractIssue[] };

function issue(path: string): ProjectContractIssue {
  return Object.freeze({ code: "PROJECT_REFERENCE_MISSING", path });
}

function hasRequiredHash(
  manifest: KnowledgePackageManifest,
  role: string,
  sha256: string,
): boolean {
  return manifest.entries.some(
    (entry) => entry.role === role && entry.required && entry.sha256 === sha256,
  );
}

function hasExactTruthHashes(
  manifest: KnowledgePackageManifest,
  role: string,
  expectedValues: readonly string[],
): boolean {
  const actual = manifest.entries
    .filter((entry) => entry.role === role)
    .map((entry) => entry.sha256);
  const expected = new Set(expectedValues);
  return (
    actual.length === expected.size &&
    new Set(actual).size === actual.length &&
    actual.every((sha256) => expected.has(sha256))
  );
}

export function validateKnowledgeBundle(
  projectInput: unknown,
  manifestInput: unknown,
  auditInputs: readonly unknown[],
): KnowledgeBundleValidationResult {
  const projectResult = validateProjectContract(projectInput);
  if (!projectResult.ok) {
    return projectResult;
  }
  const manifestResult = validateProjectContract(manifestInput);
  if (!manifestResult.ok) {
    return manifestResult;
  }
  const auditEvents: SemanticAuditEvent[] = [];
  for (const auditInput of auditInputs) {
    const auditResult = validateProjectContract(auditInput);
    if (!auditResult.ok) {
      return auditResult;
    }
    if (auditResult.value.contract_kind !== "semantic_audit_event") {
      return Object.freeze({
        ok: false,
        issues: Object.freeze([issue("/bundle/audits")]),
      });
    }
    auditEvents.push(auditResult.value);
  }
  const project = projectResult.value;
  const manifest = manifestResult.value;
  if (
    project.contract_kind !== "project" ||
    manifest.contract_kind !== "knowledge_package"
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue("/bundle")]),
    });
  }

  const auditIds = new Set(auditEvents.map((entry) => entry.event_id));
  const identityMatches =
    manifest.project_id === project.project_id &&
    auditEvents.every((entry) => entry.project_id === project.project_id);
  const auditSetMatches =
    auditEvents.length === project.semantic_audit_event_ids.length &&
    auditIds.size === project.semantic_audit_event_ids.length &&
    project.semantic_audit_event_ids.every(
      (entry, index) =>
        auditIds.has(entry) &&
        auditEvents[index]?.event_id === entry &&
        auditEvents[index]?.sequence === index,
    );
  const truthMatches =
    hasExactTruthHashes(manifest, "truth.document", [
      project.document.sha256,
      ...project.formal_versions.map((entry) => entry.document_sha256),
    ]) &&
    hasExactTruthHashes(manifest, "truth.template", [
      project.template.sha256,
      ...project.formal_versions.map((entry) => entry.template_sha256),
    ]) &&
    hasExactTruthHashes(
      manifest,
      "truth.material",
      project.materials.map((entry) => entry.sha256),
    ) &&
    hasRequiredHash(manifest, "truth.document", project.document.sha256) &&
    hasRequiredHash(manifest, "truth.template", project.template.sha256) &&
    project.formal_versions.every(
      (version) =>
        hasRequiredHash(manifest, "truth.document", version.document_sha256) &&
        hasRequiredHash(manifest, "truth.template", version.template_sha256),
    ) &&
    project.materials.every((material) =>
      hasRequiredHash(manifest, "truth.material", material.sha256),
    );
  const materialHashes = new Map(
    project.materials.map((entry) => [entry.material_id, entry.sha256]),
  );
  const sourcesMatch = auditEvents.every((event) =>
    event.source_refs.every(
      (source) => materialHashes.get(source.material_id) === source.sha256,
    ),
  );
  const approvalsMatch = project.formal_versions.every((version) => {
    const event = auditEvents.find(
      (entry) => entry.event_id === version.approval_event_id,
    );
    return (
      event?.action === "formal_version_approved" &&
      event.decision === "approved" &&
      event.after_sha256 === version.document_sha256
    );
  });
  if (
    !identityMatches ||
    !auditSetMatches ||
    !truthMatches ||
    !sourcesMatch ||
    !approvalsMatch
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([issue("/bundle")]),
    });
  }
  return Object.freeze({ ok: true });
}
