/* Generated from schema/host-payloads-0.2.0.schema.json. Do not edit directly. */

/**
 * PB-10 frozen concrete payload schemas for the seven implemented host capabilities (protocol 0.2.0). Locations are expressed only as grant_id plus safe file names; no path, raw system error, or user content may appear in outputs or errors.
 */
export type HostPayloadSchemas =
  | ProjectDirectorySelectInput
  | ProjectDirectorySelectOutput
  | ProjectDirectoryAuthorizeInput
  | ProjectDirectoryAuthorizeOutput
  | ProjectSaveAtomicInput
  | ProjectSaveAtomicOutput
  | ProjectSaveAsInput
  | ProjectSaveAsOutput
  | ProjectBackupCreateInput
  | ProjectBackupCreateOutput
  | ProjectBackupRestoreInput
  | ProjectBackupRestoreOutput
  | FileExportWriteInput
  | FileExportWriteOutput;
export type GrantId = string;
export type SafeFileName = string;
/**
 * RFC 4648 base64 with canonical padding. Validated programmatically (O(n), no backtracking) by the content-base64 Ajv format: the previous pattern form exhausted the V8 RegExp stack inside the advertised maxLength range (PB-12 audit MAJOR-1).
 */
export type ContentBase64 = string;
export type Sha256 = string;
export type BackupId = string;
export type IsoTimestamp = string;
export type MediaType = string;

export interface ProjectDirectorySelectInput {
  purpose?: "open_project" | "save_project" | "export_file" | "backup";
}
export interface ProjectDirectorySelectOutput {
  grant_id: GrantId;
  display_name: string;
}
export interface ProjectDirectoryAuthorizeInput {
  grant_id: GrantId;
  requested_mode?: "read_write" | "read_only";
}
export interface ProjectDirectoryAuthorizeOutput {
  grant_id: GrantId;
  mode: "read_write" | "read_only";
}
export interface ProjectSaveAtomicInput {
  grant_id: GrantId;
  file_name: SafeFileName;
  content_base64: ContentBase64;
  content_sha256: Sha256;
  /**
   * SHA-256 of the content being overwritten, or null to assert the file does not exist yet. Mismatch fails closed with HOST_CONFLICT.
   */
  expected_previous_sha256: Sha256 | null;
}
export interface ProjectSaveAtomicOutput {
  grant_id: GrantId;
  file_name: SafeFileName;
  sha256: Sha256;
  bytes_written: number;
}
export interface ProjectSaveAsInput {
  grant_id: GrantId;
  file_name: SafeFileName;
  content_base64: ContentBase64;
  content_sha256: Sha256;
}
export interface ProjectSaveAsOutput {
  grant_id: GrantId;
  file_name: SafeFileName;
  sha256: Sha256;
  bytes_written: number;
}
export interface ProjectBackupCreateInput {
  grant_id: GrantId;
}
export interface ProjectBackupCreateOutput {
  grant_id: GrantId;
  backup_id: BackupId;
  created_at: IsoTimestamp;
  sha256: Sha256;
}
export interface ProjectBackupRestoreInput {
  grant_id: GrantId;
  backup_id: BackupId;
}
export interface ProjectBackupRestoreOutput {
  grant_id: GrantId;
  backup_id: BackupId;
  restored: true;
}
export interface FileExportWriteInput {
  grant_id: GrantId;
  file_name: SafeFileName;
  content_base64: ContentBase64;
  content_sha256: Sha256;
  media_type: MediaType;
  overwrite: boolean;
}
export interface FileExportWriteOutput {
  grant_id: GrantId;
  file_name: SafeFileName;
  sha256: Sha256;
  bytes_written: number;
}
