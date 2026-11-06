/* Generated from schema/check-report.schema.json. Do not edit directly. */

/**
 * Version 1.1.0 report of rule-based checks over the PA-06 PDF evidence model. Findings carry stable codes, page/node locations and numeric basis only; document content is never echoed. Adds manualChecks (PA-08 honesty gate): judgments the rules cannot determine automatically are deferred to explicit human review with numeric evidence, never disguised as automatic passes. Additive over frozen 1.0.0.
 */
export interface WenshuCheckReport {
  checkReportVersion: "1.1.0";
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
  /**
   * Explicit human-review items for judgments that have no deterministic or template-traceable basis (e.g. sparse-page density, heading keep-with-next gray zone). Presence of a manual check is never a pass and never a finding.
   */
  manualChecks: ManualCheck[];
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
export interface ManualCheck {
  ruleId: string;
  /**
   * Stable review code for the deferred judgment (P1_* review codes land in PA-08~10).
   */
  code: string;
  pageIndex: number;
  /**
   * Deterministic node locator, same vocabulary as Finding.nodeRef.
   */
  nodeRef: string;
  /**
   * Static explanation of why automatic determination is impossible (template silence, registered approximation). Static text only, never document content.
   */
  reason: string;
  basis: {
    /**
     * Numeric evidence for the human reviewer (e.g. coverageRatio, followingLinesOnPage, template threshold). Named values only, never text.
     */
    metrics: {
      [k: string]: number;
    };
    /**
     * Second party for paired review items.
     */
    relatedNodeRef?: string;
  };
}
