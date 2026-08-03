/* Generated from schema/host-0.3.0.schema.json. Do not edit directly. */

/**
 * Additive protocol 0.3.0: identical message shapes to the frozen 0.1.0 envelope, but protocol_version is 0.3.0 and capability_version/schema IDs may be 0.1.0 (legacy placeholder declarations), 0.2.0 (PB-10 frozen concrete payload declarations), or 0.3.0 (A-02 frozen file.import.select payload declarations, ADR-0029). Leaf definitions are reused from the frozen 0.1.0 schema by reference.
 */
export type HostContractMessageV03 =
  | HostRegistry
  | HostRequest
  | HostCancelRequest
  | HostProgressEvent
  | HostSuccessResult
  | HostFailureResult
  | HostCancelledResult;
export type ProtocolVersion = "0.3.0";
export type HostInstanceId = string;
export type CapabilityName =
  | "project.directory.select"
  | "project.directory.authorize"
  | "project.save.atomic"
  | "project.save.as"
  | "project.backup.create"
  | "project.backup.restore"
  | "file.import.select"
  | "file.export.write"
  | "print.pdf.export"
  | "font.catalog.list"
  | "font.catalog.check"
  | "window.control"
  | "clipboard.text.write"
  | "share.invoke"
  | "link.open.external"
  | "secret.credential.manage"
  | "secret.credential.status"
  | "platform.info.read";
export type CapabilityVersion = "0.1.0" | "0.2.0" | "0.3.0";
export type InputSchemaId = string;
export type OutputSchemaId = string;
export type ErrorCode =
  | "HOST_UNSUPPORTED"
  | "HOST_PERMISSION_REQUIRED"
  | "HOST_PERMISSION_DENIED"
  | "HOST_CANCELLED"
  | "HOST_TIMEOUT"
  | "HOST_INVALID_REQUEST"
  | "HOST_CONFLICT"
  | "HOST_NOT_FOUND"
  | "HOST_QUOTA_EXCEEDED"
  | "HOST_IO_FAILURE"
  | "HOST_INTEGRITY_FAILURE"
  | "HOST_BUSY"
  | "HOST_INTERNAL";
export type RequestId = string;

export interface HostRegistry {
  protocol_version: ProtocolVersion;
  kind: "registry";
  host_kind: "browser" | "electron" | "arkweb";
  host_version: string;
  instance_id: HostInstanceId;
  /**
   * @minItems 1
   * @maxItems 64
   */
  capabilities: CapabilityDeclaration[];
}
export interface CapabilityDeclaration {
  name: CapabilityName;
  capability_version: CapabilityVersion;
  support_status: "supported" | "degraded" | "unsupported";
  permission_status:
    "not_applicable" | "unknown" | "prompt" | "granted" | "denied" | "restricted";
  input_schema: InputSchemaId;
  output_schema: OutputSchemaId;
  limits: CapabilityLimits;
  lifecycle: "request" | "session" | "application";
  cancellation: "none" | "cooperative";
  progress: "none" | "discrete" | "continuous";
  /**
   * @minItems 1
   * @maxItems 13
   */
  error_codes: ErrorCode[];
  fallback: Fallback;
}
export interface CapabilityLimits {
  max_concurrent_requests: number;
  timeout_ms: number;
  max_payload_bytes: number;
}
export interface Fallback {
  strategy:
    | "none"
    | "browser_download"
    | "manual_file_picker"
    | "manual_copy"
    | "manual_share"
    | "system_print"
    | "read_only";
  reason_code: string;
}
export interface HostRequest {
  protocol_version: ProtocolVersion;
  kind: "request";
  request_id: RequestId;
  capability: CapabilityName;
  capability_version: CapabilityVersion;
  input: JsonObject;
}
export interface JsonObject {
  [k: string]: unknown;
}
export interface HostCancelRequest {
  protocol_version: ProtocolVersion;
  kind: "cancel";
  request_id: RequestId;
  reason: "user" | "superseded" | "shutdown" | "deadline";
}
export interface HostProgressEvent {
  protocol_version: ProtocolVersion;
  kind: "progress";
  request_id: RequestId;
  capability: CapabilityName;
  sequence: number;
  phase: "queued" | "awaiting_permission" | "running" | "finalizing";
  completed: number;
  total: number;
  message_key: string;
}
export interface HostSuccessResult {
  protocol_version: ProtocolVersion;
  kind: "success";
  request_id: RequestId;
  capability: CapabilityName;
  output: JsonObject;
}
export interface HostFailureResult {
  protocol_version: ProtocolVersion;
  kind: "failure";
  request_id: RequestId;
  capability: CapabilityName;
  error: HostError;
  fallback: Fallback;
}
export interface HostError {
  code: ErrorCode;
  retryable: boolean;
  detail_key: string;
}
export interface HostCancelledResult {
  protocol_version: ProtocolVersion;
  kind: "cancelled";
  request_id: RequestId;
  capability: CapabilityName;
  reason: "user" | "superseded" | "shutdown" | "deadline";
}
