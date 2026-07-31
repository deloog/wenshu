export type KnowledgePackageErrorCode =
  | "PACKAGE_CONTRACT_INVALID"
  | "PACKAGE_HASH_MISMATCH"
  | "PACKAGE_MISSING_ENTRY"
  | "PACKAGE_MANIFEST_MISMATCH"
  | "PACKAGE_ZIP_INVALID"
  | "PACKAGE_IO_FAILURE";

export class KnowledgePackageError extends Error {
  readonly code: KnowledgePackageErrorCode;
  readonly path: string | undefined;

  constructor(
    code: KnowledgePackageErrorCode,
    message: string,
    options?: { readonly path?: string },
  ) {
    super(message);
    this.code = code;
    this.path = options?.path;
  }
}
