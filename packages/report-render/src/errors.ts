export type RenderCheckCode =
  | "RENDER_BROWSER_UNAVAILABLE"
  | "RENDER_BROWSER_PROTOCOL"
  | "RENDER_CANCELLED"
  | "RENDER_FONT_INTEGRITY"
  | "RENDER_FONT_LOAD_FAILED"
  | "RENDER_FONT_FALLBACK"
  | "RENDER_TEXT_MISMATCH";

export class RenderCheckError extends Error {
  public readonly code: RenderCheckCode;

  public constructor(code: RenderCheckCode, message: string) {
    super(message);
    this.name = "RenderCheckError";
    this.code = code;
  }
}
