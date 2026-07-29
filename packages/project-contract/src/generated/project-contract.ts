/* Generated from schema/project-contract.schema.json. Do not edit directly. */

/**
 * Version 0 contracts for project truth, knowledge packages, semantic audit, and compatibility.
 */
export type ProjectContract =
  | ProjectManifest
  | KnowledgePackageManifest
  | SemanticAuditEvent
  | CompatibilityManifest;
export type ProjectId = string;
export type Sha256 = string;
export type MaterialId = string;
export type AuditEventId = string;
export type FormalVersionId = string;
export type Timestamp = string;
export type SemanticAuditEvent = {
  [k: string]: unknown;
} & {
  contract_kind: "semantic_audit_event";
  schema_version: "0.1.0" | "0.2.0";
  event_id: AuditEventId;
  project_id: ProjectId;
  sequence: number;
  occurred_at: Timestamp;
  actor: "user" | "system";
  action:
    | "ai_change_decided"
    | "user_changed_after_ai"
    | "source_linked"
    | "template_applied"
    | "formal_version_approved";
  decision: "accepted" | "rejected" | "applied" | "approved";
  affected_node_ids: string[];
  before_sha256: Sha256 | null;
  before_hash_subject?: "document" | "template";
  after_sha256: Sha256 | null;
  after_hash_subject?: "document" | "template";
  source_refs: SourceReference[];
  subject_model_context: ModelContext | null;
};

export interface ProjectManifest {
  contract_kind: "project";
  schema_version: "0.1.0";
  project_id: ProjectId;
  revision: number;
  title: string;
  document: DocumentReference;
  template: TemplateReference;
  materials: MaterialReference[];
  semantic_audit_event_ids: AuditEventId[];
  formal_versions: FormalVersion[];
  derived_data: DerivedDataDescriptor[];
}
export interface DocumentReference {
  schema_version: "0.1.0" | "0.2.0";
  document_id: string;
  revision: number;
  sha256: Sha256;
}
export interface TemplateReference {
  dsl_version: "0.1.0";
  template_id: string;
  version: string;
  sha256: Sha256;
}
export interface MaterialReference {
  material_id: MaterialId;
  display_name: string;
  media_type:
    | "text/markdown"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "image/png"
    | "image/jpeg"
    | "image/svg+xml"
    | "text/csv";
  sha256: Sha256;
}
export interface FormalVersion {
  version_id: FormalVersionId;
  created_at: Timestamp;
  document_sha256: Sha256;
  template_sha256: Sha256;
  approval_event_id: AuditEventId;
}
export interface DerivedDataDescriptor {
  kind: "search_index" | "vector_index" | "render_cache" | "thumbnail";
  rebuildable: true;
  /**
   * @minItems 1
   */
  source_sha256s: Sha256[];
}
export interface KnowledgePackageManifest {
  contract_kind: "knowledge_package";
  format_version: "0.1.0";
  package_id: string;
  project_id: ProjectId;
  created_at: Timestamp;
  /**
   * @minItems 4
   * @maxItems 10000
   */
  entries: PackageEntry[];
}
export interface PackageEntry {
  path: string;
  role:
    | "truth.project"
    | "truth.document"
    | "truth.template"
    | "truth.audit"
    | "truth.material"
    | "derived.search_index"
    | "derived.vector_index"
    | "derived.render_cache"
    | "derived.thumbnail";
  classification: "truth" | "derived";
  required: boolean;
  sha256: Sha256;
  size_bytes: number;
  rebuildable: boolean;
}
export interface SourceReference {
  material_id: MaterialId;
  sha256: Sha256;
  locator: string | null;
}
export interface ModelContext {
  provider: "anthropic" | "google" | "local" | "openai" | "test";
  model: string;
  invocation_id: string;
}
export interface CompatibilityManifest {
  contract_kind: "compatibility";
  policy_version: "0.1.0";
  readers: {
    project: "0.1.0";
    knowledge_package: "0.1.0";
    semantic_audit: "0.1.0";
    document: "0.2.0";
    template: "0.1.0";
  };
  unknown_version: "reject";
  same_major_change: "explicit_adapter_required";
  destructive_change: "new_major_and_adr";
  history_policy: "preserve_schema_and_migrations";
  /**
   * @maxItems 0
   */
  migration_paths: unknown[];
}
