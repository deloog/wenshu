export type FixtureIntegrityCode =
  | "FIXTURE_COPY_INVALID"
  | "FIXTURE_ENTRY_INVALID"
  | "FIXTURE_MANIFEST_INVALID"
  | "FIXTURE_SET_MISMATCH";

export class FixtureIntegrityError extends Error {
  readonly code: FixtureIntegrityCode;

  constructor(code: FixtureIntegrityCode, message: string) {
    super(message);
    this.name = "FixtureIntegrityError";
    this.code = code;
  }
}
