/* Generated from schema/evidence.schema.json. Do not edit directly. */

/**
 * Version 1.1 PDF geometric/textual evidence model extracted from the signed baseline PDF. Pure extraction facts; no quality judgement fields are allowed. Additive over 1.0.0 (decision #10): TextRun.figureMcid (parse-time /Figure membership) and FigureBox.paintBBox (painted-only extent, clip excluded). The reader keeps accepting frozen 1.0.0 data (schema/evidence-1.0.0.schema.json).
 */
export interface WenshuPdfEvidence {
  evidenceVersion: "1.1.0";
  source: EvidenceSource;
  /**
   * @minItems 1
   */
  pages: PageBox[];
  textRuns: TextRun[];
  figures: FigureBox[];
  /**
   * @minItems 1
   */
  fonts: FontInfo[];
}
export interface EvidenceSource {
  /**
   * SHA-256 of the exact PDF bytes this evidence was extracted from.
   */
  sha256: string;
  pageCount: number;
  /**
   * PDF /Producer marker of the generating engine (e.g. Skia/PDF).
   */
  producer: string;
}
export interface PageBox {
  index: number;
  /**
   * @minItems 4
   * @maxItems 4
   */
  mediaBox: number[];
  widthPt: number;
  heightPt: number;
  rotate: 0 | 90 | 180 | 270;
}
export interface TextRun {
  pageIndex: number;
  text: string;
  bbox: BBox;
  /**
   * Baseline position in PDF user space (pt).
   */
  baselineY: number;
  fontSize: number;
  font: FontRef;
  /**
   * MCID logical block sequence within the page content stream.
   */
  blockOrder: number;
  /**
   * Global reading sequence after MCID block order, y-bucket, x sort (PA-05 rule).
   */
  readingOrder: number;
  /**
   * Text comes from an ActualText span rather than glyph decoding.
   */
  viaActualText: boolean;
  /**
   * Parse-time /Figure membership (decision #10): the MCID of the single /Figure marked-content span inside which every glyph of this run was emitted; null when the run sits outside all /Figure spans or straddles span boundaries. Never derived from bbox geometry.
   */
  figureMcid: number | null;
}
export interface BBox {
  /**
   * Left edge in PDF user space (pt).
   */
  x: number;
  /**
   * Top edge in PDF user space (pt), baseline-derived for text runs.
   */
  y: number;
  width: number;
  height: number;
}
export interface FontRef {
  objectId: number;
  /**
   * Resource tag used by content streams (e.g. F30).
   */
  tag: string;
  family: string;
  weight: number | null;
  subset: boolean;
  embedded: boolean;
}
export interface FigureBox {
  pageIndex: number;
  /**
   * Marked content id of the /Figure span on the page.
   */
  mcid: number;
  bbox: BBox;
  paintBBox: BBox1;
  /**
   * v1 pipeline emits SVG figures as vector content only; raster images would require a version bump.
   */
  kind: "vector-figure";
  /**
   * Caption-level /Alt from the parent Figure structure element (caption association).
   */
  altShort: string | null;
  /**
   * Descriptive /Alt from the leaf Figure structure element bound to this MCID.
   */
  altLong: string | null;
}
/**
 * Painted extent: union of path points consumed by painting operators (f/F/S/s/B/b family) and member text-run bboxes. Clip paths (W n) never contribute; the pipeline's page-wide SVG root clip inflates bbox but not paintBBox. Zero box when the span paints nothing.
 */
export interface BBox1 {
  /**
   * Left edge in PDF user space (pt).
   */
  x: number;
  /**
   * Top edge in PDF user space (pt), baseline-derived for text runs.
   */
  y: number;
  width: number;
  height: number;
}
export interface FontInfo {
  name: string;
  family: string;
  weight: number | null;
  subtype: string;
  subset: boolean;
  embedded: boolean;
}
