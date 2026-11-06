/* Generated from schema/host-payloads-0.3.0.schema.json. Do not edit directly. */

/**
 * A-02 frozen concrete payload schemas for file.import.select (protocol 0.3.0, ADR-0029). The output expresses the selection only as single-file FileGrant handles (grant_id) plus display metadata: it must never carry a system path (ADR-0029 section 1, item 1-a). file_name is display metadata only and never participates in file-system addressing.
 */
export type HostPayloadSchemasV03 = FileImportSelectInput | FileImportSelectOutput;
export type GrantId = string;
/**
 * Display metadata only: no path separators, no colon, no control characters, never a bare dot segment, at most 128 characters. Never participates in file-system addressing.
 */
export type FileDisplayName = string;
export type Sha256 = string;

export interface FileImportSelectInput {
  purpose?: "import_markdown";
  multiple?: boolean;
  /**
   * @maxItems 8
   */
  extensions?: string[];
}
export interface FileImportSelectOutput {
  /**
   * @minItems 1
   * @maxItems 64
   */
  files: {
    grant_id: GrantId;
    file_name: FileDisplayName;
    content_sha256: Sha256;
    size_bytes: number;
  }[];
}
