export { preflightPdf } from "./classify.ts";
export type { PdfEvidenceFailure, PdfEvidenceFailureCode } from "./classify.ts";
export { extractEvidence } from "./extract-evidence.ts";
export type { EvidenceExtractionResult } from "./extract-evidence.ts";
export type * from "./generated/evidence.ts";
export { EVIDENCE_VERSION, validateEvidence } from "./validate.ts";
export type {
  EvidenceIssue,
  EvidenceIssueCode,
  EvidenceValidationResult,
} from "./validate.ts";
