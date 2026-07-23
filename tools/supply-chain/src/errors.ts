export type SupplyChainCode =
  "SBOM_INVALID" | "SBOM_DRIFT" | "LICENSE_BLOCKED" | "TOOLCHAIN_DRIFT";

export class SupplyChainError extends Error {
  public readonly code: SupplyChainCode;

  public constructor(code: SupplyChainCode, message: string) {
    super(message);
    this.name = "SupplyChainError";
    this.code = code;
  }
}
