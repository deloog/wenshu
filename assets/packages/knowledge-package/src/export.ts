import { DOCUMENT_SCHEMA_VERSION } from "@wenshu/document-model";
import {
  validateProjectContract,
  type KnowledgePackageManifest,
  type MaterialReference,
  type ProjectManifest,
  type SemanticAuditEvent,
} from "@wenshu/project-contract";
import { TEMPLATE_DSL_VERSION } from "@wenshu/template-model";

import { KnowledgePackageError } from "./errors.ts";
import { canonicalJsonBytes, canonicalNdjsonBytes, sha256 } from "./serialization.ts";
import type {
  ExportKnowledgePackageOptions,
  ExportedKnowledgePackage,
} from "./types.ts";
import { mustValidateDocument, mustValidateTemplate } from "./validate.ts";
import { createZip, type ZipEntry } from "./zip.ts";

const mediaTypeExtensionMap: Readonly<Record<string, string>> = Object.freeze({
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
});

function extensionForMediaType(mediaType: string): string {
  const extension = mediaTypeExtensionMap[mediaType];
  if (extension === undefined) {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      `unsupported material media type: ${mediaType}`,
    );
  }
  return extension;
}

function validateAndSortAudits(
  audits: readonly unknown[],
): readonly SemanticAuditEvent[] {
  const validated: SemanticAuditEvent[] = [];
  for (const [index, audit] of audits.entries()) {
    const result = validateProjectContract(audit);
    if (!result.ok) {
      throw new KnowledgePackageError(
        "PACKAGE_CONTRACT_INVALID",
        `audit ${index} failed validation: ${JSON.stringify(result.issues)}`,
      );
    }
    if (result.value.contract_kind !== "semantic_audit_event") {
      throw new KnowledgePackageError(
        "PACKAGE_CONTRACT_INVALID",
        `audit ${index} is not a semantic_audit_event`,
      );
    }
    validated.push(result.value);
  }
  return Object.freeze(validated.sort((left, right) => left.sequence - right.sequence));
}

/**
 * Build a complete knowledge package as a ZIP byte array. Every SHA-256 is
 * computed from the canonical serialized bytes of the corresponding entry:
 * truth.project and truth.audit are no longer self-reported; document,
 * template and material hashes are cross-checked against the project manifest.
 */
export function exportKnowledgePackage(
  options: ExportKnowledgePackageOptions,
): ExportedKnowledgePackage {
  const validatedDocument = mustValidateDocument(options.document.value);
  const validatedTemplate = mustValidateTemplate(options.template.value);

  const documentBytes = canonicalJsonBytes(validatedDocument);
  const documentSha256 = sha256(documentBytes);
  const templateBytes = canonicalJsonBytes(validatedTemplate);
  const templateSha256 = sha256(templateBytes);

  const materialEntries = options.materials.map((material) => ({
    material,
    bytes: material.bytes,
    sha256: sha256(material.bytes),
    path: `truth/materials/${material.materialId}.${extensionForMediaType(material.mediaType)}`,
  }));

  const derivedEntries = (options.derived ?? []).map((derived, index) => ({
    derived,
    bytes: derived.bytes,
    sha256: sha256(derived.bytes),
    path: `derived/${derived.kind}.${index}.idx`,
  }));

  const validatedAudits = validateAndSortAudits(options.audits);
  const auditBytes = canonicalNdjsonBytes(validatedAudits);
  const auditSha256 = sha256(auditBytes);

  const project: ProjectManifest = {
    contract_kind: "project",
    schema_version: "0.1.0",
    project_id: options.projectId,
    revision: options.revision,
    title: options.title,
    document: {
      schema_version: DOCUMENT_SCHEMA_VERSION,
      document_id: options.document.documentId,
      revision: options.document.revision,
      sha256: documentSha256,
    },
    template: {
      dsl_version: TEMPLATE_DSL_VERSION,
      template_id: options.template.templateId,
      version: options.template.version,
      sha256: templateSha256,
    },
    materials: materialEntries.map((entry) => ({
      material_id: entry.material.materialId,
      display_name: entry.material.displayName,
      media_type: entry.material.mediaType as MaterialReference["media_type"],
      sha256: entry.sha256,
    })),
    semantic_audit_event_ids: validatedAudits.map((audit) => audit.event_id),
    formal_versions: [],
    derived_data: derivedEntries.map((entry) => ({
      kind: entry.derived.kind,
      rebuildable: true,
      source_sha256s: [...entry.derived.sourceSha256s],
    })),
  };

  const projectValidation = validateProjectContract(project);
  if (!projectValidation.ok) {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      `built project manifest failed validation: ${JSON.stringify(projectValidation.issues)}`,
    );
  }
  const projectBytes = canonicalJsonBytes(projectValidation.value);
  const projectSha256 = sha256(projectBytes);

  const entries: ZipEntry[] = [
    { path: "truth/project.json", bytes: projectBytes },
    { path: "truth/audit.ndjson", bytes: auditBytes },
    { path: "truth/document.json", bytes: documentBytes },
    { path: "truth/template.json", bytes: templateBytes },
    ...materialEntries.map((entry) => ({ path: entry.path, bytes: entry.bytes })),
    ...derivedEntries.map((entry) => ({ path: entry.path, bytes: entry.bytes })),
  ];

  const manifest = buildManifest(options, {
    projectBytes,
    projectSha256,
    auditBytes,
    auditSha256,
    documentBytes,
    documentSha256,
    templateBytes,
    templateSha256,
    materialEntries,
    derivedEntries,
  });

  const manifestResult = validateProjectContract(manifest);
  if (!manifestResult.ok) {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      `built package manifest failed validation: ${JSON.stringify(manifestResult.issues)}`,
    );
  }

  const manifestBytes = canonicalJsonBytes(manifestResult.value);
  const zip = createZip([{ path: "manifest.json", bytes: manifestBytes }, ...entries]);

  return Object.freeze({
    bytes: zip,
    manifest: manifestResult.value as KnowledgePackageManifest,
    project: projectValidation.value as ProjectManifest,
  });
}

interface HashedParts {
  readonly projectBytes: Uint8Array;
  readonly projectSha256: string;
  readonly auditBytes: Uint8Array;
  readonly auditSha256: string;
  readonly documentBytes: Uint8Array;
  readonly documentSha256: string;
  readonly templateBytes: Uint8Array;
  readonly templateSha256: string;
  readonly materialEntries: ReadonlyArray<{
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly sha256: string;
  }>;
  readonly derivedEntries: ReadonlyArray<{
    readonly derived: { readonly kind: string };
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly sha256: string;
  }>;
}

function buildManifest(
  options: ExportKnowledgePackageOptions,
  parts: HashedParts,
): KnowledgePackageManifest {
  return {
    contract_kind: "knowledge_package",
    format_version: "0.1.0",
    package_id: options.packageId,
    project_id: options.projectId,
    created_at: options.createdAt,
    entries: [
      {
        path: "truth/project.json",
        role: "truth.project",
        classification: "truth",
        required: true,
        sha256: parts.projectSha256,
        size_bytes: parts.projectBytes.length,
        rebuildable: false,
      },
      {
        path: "truth/audit.ndjson",
        role: "truth.audit",
        classification: "truth",
        required: true,
        sha256: parts.auditSha256,
        size_bytes: parts.auditBytes.length,
        rebuildable: false,
      },
      {
        path: "truth/document.json",
        role: "truth.document",
        classification: "truth",
        required: true,
        sha256: parts.documentSha256,
        size_bytes: parts.documentBytes.length,
        rebuildable: false,
      },
      {
        path: "truth/template.json",
        role: "truth.template",
        classification: "truth",
        required: true,
        sha256: parts.templateSha256,
        size_bytes: parts.templateBytes.length,
        rebuildable: false,
      },
      ...parts.materialEntries.map((entry) => ({
        path: entry.path,
        role: "truth.material" as const,
        classification: "truth" as const,
        required: true,
        sha256: entry.sha256,
        size_bytes: entry.bytes.length,
        rebuildable: false,
      })),
      ...parts.derivedEntries.map((entry) => ({
        path: entry.path,
        role: `derived.${entry.derived.kind}` as
          | "derived.search_index"
          | "derived.vector_index"
          | "derived.render_cache"
          | "derived.thumbnail",
        classification: "derived" as const,
        required: false,
        sha256: entry.sha256,
        size_bytes: entry.bytes.length,
        rebuildable: true,
      })),
    ],
  };
}
