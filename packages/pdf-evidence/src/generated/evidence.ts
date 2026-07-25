/* Generated from schema/evidence.schema.json. Do not edit directly. */

/**
 * Version 1 PDF geometric/textual evidence model extracted from the signed baseline PDF. Pure extraction facts; no quality judgement fields are allowed.
 */
export interface WenshuPdfEvidence {
  evidenceVersion: "1.0.0";
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
export interface FontInfo {
  name: string;
  family: string;
  weight: number | null;
  subtype: string;
  subset: boolean;
  embedded: boolean;
}
