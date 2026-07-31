import { HOST_CAPABILITIES } from "@wenshu/host-contract";

import type { FileBoundaryCode } from "./errors.ts";

const FAILURE_META: Readonly<
  Record<FileBoundaryCode, { readonly retryable: boolean; readonly detailKey: string }>
> = Object.freeze({
  CANCELLED: Object.freeze({ retryable: false, detailKey: "host.file.cancelled" }),
  CONFLICT: Object.freeze({ retryable: false, detailKey: "host.file.conflict" }),
  INTEGRITY_FAILURE: Object.freeze({
    retryable: false,
    detailKey: "host.file.integrity_failure",
  }),
  INTERNAL: Object.freeze({ retryable: false, detailKey: "host.file.internal" }),
  INVALID: Object.freeze({ retryable: false, detailKey: "host.file.invalid_request" }),
  IO_FAILURE: Object.freeze({ retryable: true, detailKey: "host.file.io_failure" }),
  NOT_FOUND: Object.freeze({ retryable: false, detailKey: "host.file.not_found" }),
  PERMISSION_DENIED: Object.freeze({
    retryable: true,
    detailKey: "host.file.permission_denied",
  }),
  QUOTA_EXCEEDED: Object.freeze({
    retryable: false,
    detailKey: "host.file.quota_exceeded",
  }),
  TIMEOUT: Object.freeze({ retryable: true, detailKey: "host.file.timeout" }),
});

const HOST_ERROR_CODES: Readonly<Record<FileBoundaryCode, string>> = Object.freeze({
  CANCELLED: "HOST_CANCELLED",
  CONFLICT: "HOST_CONFLICT",
  INTEGRITY_FAILURE: "HOST_INTEGRITY_FAILURE",
  INTERNAL: "HOST_INTERNAL",
  INVALID: "HOST_INVALID_REQUEST",
  IO_FAILURE: "HOST_IO_FAILURE",
  NOT_FOUND: "HOST_NOT_FOUND",
  PERMISSION_DENIED: "HOST_PERMISSION_DENIED",
  QUOTA_EXCEEDED: "HOST_QUOTA_EXCEEDED",
  TIMEOUT: "HOST_TIMEOUT",
});

function fallbackFor(
  code: FileBoundaryCode,
  capability: string,
): Record<string, unknown> {
  if (code === "PERMISSION_DENIED" && capability === "project.directory.select") {
    return { strategy: "manual_file_picker", reason_code: "PERMISSION_DENIED" };
  }
  if (code === "NOT_FOUND") {
    return { strategy: "manual_file_picker", reason_code: "GRANT_NOT_FOUND" };
  }
  return { strategy: "read_only", reason_code: code };
}

export function failureMessage(
  protocolVersion: string,
  requestId: string,
  capability: string,
  code: FileBoundaryCode,
): Record<string, unknown> {
  const meta = FAILURE_META[code];
  return {
    protocol_version: protocolVersion,
    kind: "failure",
    request_id: requestId,
    capability,
    error: {
      code: HOST_ERROR_CODES[code],
      retryable: meta.retryable,
      detail_key: meta.detailKey,
    },
    fallback: fallbackFor(code, capability),
  };
}

export function unsupportedTerminal(
  protocolVersion: string,
  requestId: string,
  capability: string,
  fallback: unknown,
): Record<string, unknown> {
  return {
    protocol_version: protocolVersion,
    kind: "failure",
    request_id: requestId,
    capability,
    error: {
      code: "HOST_UNSUPPORTED",
      retryable: false,
      detail_key: "host.capability.unsupported",
    },
    fallback: fallback as Record<string, unknown>,
  };
}

export function rawField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return typeof descriptor?.value === "string" ? descriptor.value : undefined;
}

export function knownCapability(input: unknown): string | undefined {
  const value = rawField(input, "capability");
  if (
    value === undefined ||
    !(HOST_CAPABILITIES as readonly string[]).includes(value)
  ) {
    return undefined;
  }
  return value;
}
