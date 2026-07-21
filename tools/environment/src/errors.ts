export type EnvironmentEvidenceCode =
  "ENV_PLATFORM_UNSUPPORTED" | "ENV_PROBE_FAILED" | "ENV_EVIDENCE_INVALID";

export class EnvironmentEvidenceError extends Error {
  public readonly code: EnvironmentEvidenceCode;

  public constructor(code: EnvironmentEvidenceCode, message: string) {
    super(message);
    this.name = "EnvironmentEvidenceError";
    this.code = code;
  }
}
