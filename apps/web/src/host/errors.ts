const FAILURE_DETAIL: Readonly<
  Record<string, { readonly retryable: boolean; readonly detailKey: string }>
> = {
  CANCELLED: { retryable: false, detailKey: "host.browser.cancelled" },
  CONFLICT: { retryable: false, detailKey: "host.browser.conflict" },
  INTEGRITY_FAILURE: {
    retryable: false,
    detailKey: "host.browser.integrity_failure",
  },
  INTERNAL: { retryable: false, detailKey: "host.browser.internal" },
  INVALID: { retryable: false, detailKey: "host.browser.invalid_request" },
  IO_FAILURE: { retryable: true, detailKey: "host.browser.io_failure" },
  NOT_FOUND: { retryable: false, detailKey: "host.browser.not_found" },
  PERMISSION_DENIED: {
    retryable: true,
    detailKey: "host.browser.permission_denied",
  },
  QUOTA_EXCEEDED: { retryable: false, detailKey: "host.browser.quota_exceeded" },
  TIMEOUT: { retryable: true, detailKey: "host.browser.timeout" },
};

export const HOST_CODE: Readonly<Record<string, string>> = {
  INVALID: "HOST_INVALID_REQUEST",
  NOT_FOUND: "HOST_NOT_FOUND",
  CONFLICT: "HOST_CONFLICT",
  PERMISSION_DENIED: "HOST_PERMISSION_DENIED",
  QUOTA_EXCEEDED: "HOST_QUOTA_EXCEEDED",
  IO_FAILURE: "HOST_IO_FAILURE",
  INTEGRITY_FAILURE: "HOST_INTEGRITY_FAILURE",
  INTERNAL: "HOST_INTERNAL",
  TIMEOUT: "HOST_TIMEOUT",
};

export class BrowserHostError extends Error {
  readonly code: keyof typeof HOST_CODE;

  constructor(code: keyof typeof HOST_CODE) {
    super(code);
    this.code = code;
  }
}

export function failureMessage(
  protocolVersion: string,
  requestId: string,
  capability: string,
  code: keyof typeof HOST_CODE,
): Record<string, unknown> {
  const meta = FAILURE_DETAIL[code] ?? {
    retryable: false,
    detailKey: "host.browser.internal",
  };
  let fallback: Record<string, unknown>;
  if (code === "PERMISSION_DENIED" && capability === "project.directory.select") {
    fallback = { strategy: "manual_file_picker", reason_code: "PERMISSION_DENIED" };
  } else if (code === "NOT_FOUND") {
    fallback = { strategy: "manual_file_picker", reason_code: "GRANT_NOT_FOUND" };
  } else {
    fallback = { strategy: "read_only", reason_code: code };
  }
  return {
    protocol_version: protocolVersion,
    kind: "failure",
    request_id: requestId,
    capability,
    error: {
      code: HOST_CODE[code],
      retryable: meta.retryable,
      detail_key: meta.detailKey,
    },
    fallback,
  };
}
