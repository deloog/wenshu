export type { P0CheckInput, P0Rule } from "./check-input.ts";
export { ReportChecksError } from "./check-input.ts";
export { buildExpectedBlocks } from "./expected-content.ts";
export type { ExpectedBlock, ExpectedBlockKind } from "./expected-content.ts";
export {
  figureRef,
  makeFinding,
  makeManualCheck,
  P0_RULE_IDS,
  P1_RULE_IDS,
  pageRef,
  runRef,
} from "./finding.ts";
export type { P0Code, P0RuleId, P1Code, P1RuleId } from "./finding.ts";
export type * from "./generated/check-report.ts";
export type { WenshuCheckReportV1_0_0 } from "./generated/check-report-1.0.0.ts";
export {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  contentBoxFromMargins,
  PAGE_SIZE_TOLERANCE_PT,
} from "./layout.ts";
export type { ContentBox, MarginMm } from "./layout.ts";
export {
  attributeBlocks,
  bodyRunIndexesOnPage,
  countLines,
  LINE_BASELINE_TOLERANCE_PT,
  pagesOfBlock,
} from "./p1-attribution.ts";
export type { AttributedBlock, BlockAttribution } from "./p1-attribution.ts";
export type { P1CheckInput, P1Rule, P1RuleResult } from "./p1-input.ts";
export { P1_RULES, runP1Checks } from "./p1-runner.ts";
export type { P1RunOptions } from "./p1-runner.ts";
export { findParagraphSplits } from "./p1-splits.ts";
export type { ParagraphSplit } from "./p1-splits.ts";
export { P0_RULES, runP0Checks } from "./runner.ts";
export type { P0RunOptions } from "./runner.ts";
export { p0BoundsRule } from "./rules/p0-bounds.ts";
export { p0ContentRule } from "./rules/p0-content.ts";
export { p0OverlapRule } from "./rules/p0-overlap.ts";
export { p0PageSizeRule } from "./rules/p0-page-size.ts";
export { p1HeadingKeepRule } from "./rules/p1-heading-keep.ts";
export { p1OrphanRule } from "./rules/p1-orphan.ts";
export { p1SparsePageRule } from "./rules/p1-sparse-page.ts";
export { p1WidowRule } from "./rules/p1-widow.ts";
export {
  CHECK_REPORT_VERSION,
  CHECK_REPORT_VERSION_1_0_0,
  SUPPORTED_CHECK_REPORT_VERSIONS,
  validateCheckReport,
} from "./validate-report.ts";
export type {
  ReportIssue,
  ReportIssueCode,
  ReportValidationResult,
  SupportedCheckReport,
} from "./validate-report.ts";
