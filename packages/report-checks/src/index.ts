export type { P0CheckInput, P0Rule } from "./check-input.ts";
export { ReportChecksError } from "./check-input.ts";
export { buildExpectedBlocks } from "./expected-content.ts";
export type { ExpectedBlock } from "./expected-content.ts";
export { figureRef, makeFinding, P0_RULE_IDS, pageRef, runRef } from "./finding.ts";
export type { P0Code, P0RuleId } from "./finding.ts";
export type * from "./generated/check-report.ts";
export {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  contentBoxFromMargins,
  PAGE_SIZE_TOLERANCE_PT,
} from "./layout.ts";
export type { ContentBox, MarginMm } from "./layout.ts";
export { P0_RULES, runP0Checks } from "./runner.ts";
export type { P0RunOptions } from "./runner.ts";
export { p0BoundsRule } from "./rules/p0-bounds.ts";
export { p0ContentRule } from "./rules/p0-content.ts";
export { p0OverlapRule } from "./rules/p0-overlap.ts";
export { p0PageSizeRule } from "./rules/p0-page-size.ts";
export { CHECK_REPORT_VERSION, validateCheckReport } from "./validate-report.ts";
export type {
  ReportIssue,
  ReportIssueCode,
  ReportValidationResult,
} from "./validate-report.ts";
