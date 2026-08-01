import type {
  KnowledgePackageManifest,
  ProjectManifest,
  SemanticAuditEvent,
} from "@wenshu/project-contract";
import type { DirectoryGrant } from "@wenshu/project-storage";

export interface KnowledgePackageDocument {
  readonly documentId: string;
  readonly revision: number;
  readonly value: unknown;
}

export interface KnowledgePackageTemplate {
  readonly templateId: string;
  readonly version: string;
  readonly value: unknown;
}

export interface KnowledgePackageMaterial {
  readonly materialId: string;
  readonly displayName: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface KnowledgePackageDerived {
  readonly kind: "search_index" | "vector_index" | "render_cache" | "thumbnail";
  readonly bytes: Uint8Array;
  readonly sourceSha256s: readonly string[];
}

export interface ExportKnowledgePackageOptions {
  readonly packageId: string;
  readonly projectId: string;
  readonly title: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly document: KnowledgePackageDocument;
  readonly template: KnowledgePackageTemplate;
  readonly materials: readonly KnowledgePackageMaterial[];
  readonly audits: readonly unknown[];
  readonly derived?: readonly KnowledgePackageDerived[];
}

export interface ExportedKnowledgePackage {
  readonly bytes: Uint8Array;
  readonly manifest: KnowledgePackageManifest;
  readonly project: ProjectManifest;
}

export interface ImportKnowledgePackageOptions {
  /** Path to the .zip knowledge package file. */
  readonly sourcePath: string;
  /** Directory that must not yet exist; will become the project root. Must be
   * the grant root itself or a descendant of it (fail-closed otherwise). */
  readonly targetRoot: string;
  /** Writable grant whose root covers the target directory; imported material
   * files are registered as originals in this grant. */
  readonly grant: DirectoryGrant;
}

export interface ImportedKnowledgePackage {
  readonly manifest: KnowledgePackageManifest;
  readonly project: ProjectManifest;
  readonly audits: readonly SemanticAuditEvent[];
}
