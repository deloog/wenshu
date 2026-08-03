/**
 * Renderer-side bridge to the preload-exposed host surfaces. The sandboxed
 * renderer has no node: APIs; every privileged effect crosses these bridges.
 */

export interface HostBridge {
  registry(): Promise<unknown>;
  invoke(request: unknown): Promise<unknown>;
  cancel(request: unknown): Promise<unknown>;
}

export interface KnowledgeExportResult {
  readonly zipBase64: string;
  readonly sha256: string;
  readonly manifestSummary: {
    readonly package_id: string;
    readonly entry_count: number;
    readonly truth_entry_count: number;
    readonly audit_event_count: number;
  };
}

export interface KnowledgeImportResult {
  readonly package_id: string;
  readonly project_id: string;
  readonly title: string;
  readonly entry_count: number;
  readonly audit_event_count: number;
  readonly material_count: number;
  readonly document_sha256: string;
  readonly target_root: string;
}

export interface E2EBridge {
  readonly export: (input: unknown) => Promise<KnowledgeExportResult>;
  readonly import: (input: unknown) => Promise<KnowledgeImportResult>;
  readonly report: (payload: unknown) => Promise<null>;
}

/* A-02 orchestration surface (ADR-0029 §4). Inputs/outputs carry only grant
 * ids, flat directory names and display metadata — never a system path. */

export interface ProjectNewInput {
  readonly grant_id: string;
  readonly dir_name: string;
}

export type ProjectNewResult =
  | { readonly status: "created"; readonly dir_name: string }
  | { readonly status: "exists" }
  | { readonly status: "error"; readonly code: string };

export interface ProjectOpenInput {
  readonly grant_id: string;
}

export type ProjectOpenResult =
  | {
      readonly status: "opened";
      readonly has_document: true;
      readonly document_sha256: string;
      readonly title?: string;
    }
  | { readonly status: "opened"; readonly has_document: false }
  | { readonly status: "corrupt" }
  | { readonly status: "error"; readonly code: string };

export interface ProjectImportInput {
  readonly project_grant_id: string;
  readonly target_dir_name: string;
  readonly source_grant_id: string;
  readonly asset_grant_ids?: readonly string[];
}

export interface ImportProgress {
  readonly import_id: string;
  readonly phase: "read" | "parse" | "write" | "finalize";
  readonly completed: number;
  readonly total: number;
}

export type ProjectImportResult = { readonly import_id: string } & (
  | {
      readonly status: "success" | "partial";
      readonly targetDirName: string;
      readonly documentSha256: string;
      readonly materialName: string;
      readonly importedAssets: readonly {
        readonly fileName: string;
        readonly path: string;
      }[];
      readonly failedAssets: readonly {
        readonly fileName: string;
        readonly reasonCode: string;
        readonly retryable: true;
      }[];
    }
  | { readonly status: "cancelled" }
  | { readonly status: "error"; readonly code: string }
);

export interface ProjectCancelInput {
  readonly import_id: string;
}

export type ProjectCancelResult =
  | { readonly status: "cancel_requested" }
  | { readonly status: "error"; readonly code: string };

export interface ProjectBridge {
  readonly newProject: (input: ProjectNewInput) => Promise<ProjectNewResult>;
  readonly openProject: (input: ProjectOpenInput) => Promise<ProjectOpenResult>;
  readonly importProject: (
    input: ProjectImportInput,
  ) => Promise<ProjectImportResult>;
  readonly cancelImport: (
    input: ProjectCancelInput,
  ) => Promise<ProjectCancelResult>;
  readonly onImportProgress: (
    callback: (progress: ImportProgress) => void,
  ) => void;
  readonly offImportProgress: () => void;
}

declare global {
  interface Window {
    wenshuHost: HostBridge;
    wenshuProject?: ProjectBridge;
    wenshuE2E?: E2EBridge;
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function e2eBridge(): E2EBridge {
  assert(
    window.wenshuE2E !== undefined,
    "wenshuE2E bridge missing: preload is not in e2e mode",
  );
  return window.wenshuE2E;
}

export function projectBridge(): ProjectBridge {
  assert(
    window.wenshuProject !== undefined,
    "wenshuProject bridge missing: preload did not expose it",
  );
  return window.wenshuProject;
}

let nextRequestOrdinal = 0;

/** Builds a real Host 0.2.0 protocol request envelope. */
export function hostRequest(
  capability: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  nextRequestOrdinal += 1;
  return {
    protocol_version: "0.2.0",
    kind: "request",
    request_id: `req_${nextRequestOrdinal.toString(16).padStart(32, "0")}`,
    capability,
    capability_version: "0.2.0",
    input,
  };
}

export async function hostInvoke(
  capability: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await window.wenshuHost.invoke(hostRequest(capability, input));
  assert(
    typeof response === "object" && response !== null,
    `${capability}: host response is not an object`,
  );
  return response as Record<string, unknown>;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
