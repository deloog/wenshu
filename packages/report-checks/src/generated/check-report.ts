/* Generated from schema/check-report.schema.json. Do not edit directly. */

/**
 * Version 1 report of rule-based checks over the PA-06 PDF evidence model. Findings carry stable codes, page/node locations and numeric basis only; document content is never echoed.
 */
export interface WenshuCheckReport {
  checkReportVersion: "1.0.0";
  source: {
    /**
     * SHA-256 of the PDF bytes the checked evidence was extracted from.
     */
    evidenceSha256: string;
  };
  /**
   * Rule ids actually executed (per-rule rollback is expressed by absence here).
   *
   * @minItems 1
   */
  rules: string[];
  findings: Finding[];
}
export interface Finding {
  ruleId: string;
  /**
   * Stable issue code; P0_* are blocking, P1_* are warnings (P1 rules land in PA-08~10).
   */
  code: string;
  pageIndex: number;
  /**
   * Deterministic node locator: run:<readingOrder>, figure:<pageIndex>:<mcid>, page:<index>, or a document block path like /blocks/3.
   */
  nodeRef: string;
  basis: {
    /**
     * Numeric evidence for the finding (e.g. overflowPt, overlapAreaPt2, expectedLength). Named values only, never text.
     */
    metrics: {
      [k: string]: number;
    };
    /**
     * Second party for pairwise findings (e.g. overlap).
     */
    relatedNodeRef?: string;
  };
}
