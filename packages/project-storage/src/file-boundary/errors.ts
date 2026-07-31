export type FileBoundaryCode =
  | "CANCELLED"
  | "CONFLICT"
  | "INTEGRITY_FAILURE"
  | "INTERNAL"
  | "INVALID"
  | "IO_FAILURE"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "QUOTA_EXCEEDED"
  | "TIMEOUT";

/**
 * Stable error for the platform file boundary. The message is always exactly
 * the code: raw system errors, paths, and user content must never leak through.
 */
export class FileBoundaryError extends Error {
  readonly code: FileBoundaryCode;

  constructor(code: FileBoundaryCode, options?: ErrorOptions) {
    super(code, options);
    this.code = code;
  }
}

function readNodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return typeof descriptor?.value === "string" ? descriptor.value : undefined;
}

export function classifyFsError(error: unknown): FileBoundaryError {
  if (error instanceof FileBoundaryError) {
    return error;
  }
  switch (readNodeErrorCode(error)) {
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return new FileBoundaryError("PERMISSION_DENIED", { cause: error });
    case "ENOENT":
      return new FileBoundaryError("NOT_FOUND", { cause: error });
    case "EEXIST":
      return new FileBoundaryError("CONFLICT", { cause: error });
    case "ENOSPC":
      return new FileBoundaryError("QUOTA_EXCEEDED", { cause: error });
    default:
      return new FileBoundaryError("IO_FAILURE", { cause: error });
  }
}
