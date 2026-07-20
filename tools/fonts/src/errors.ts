export type FontIntegrityCode =
  | "FONT_FILE_INVALID"
  | "FONT_LICENSE_INVALID"
  | "FONT_MANIFEST_INVALID"
  | "FONT_SET_MISMATCH";

export class FontIntegrityError extends Error {
  readonly code: FontIntegrityCode;

  constructor(code: FontIntegrityCode, message: string) {
    super(message);
    this.name = "FontIntegrityError";
    this.code = code;
  }
}
