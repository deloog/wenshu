import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import evidenceSchema from "../schema/evidence.schema.json" with { type: "json" };
import type { WenshuPdfEvidence } from "./generated/evidence.ts";

export const EVIDENCE_VERSION = "1.0.0" as const;

export type EvidenceIssueCode =
  | "PDF_EVIDENCE_SCHEMA"
  | "PDF_EVIDENCE_SEMANTIC"
  | "PDF_EVIDENCE_STRUCTURE"
  | "PDF_EVIDENCE_VERSION";

export interface EvidenceIssue {
  readonly code: string;
  readonly path: string;
}

export type EvidenceValidationResult =
  | {
      readonly ok: true;
      readonly value: WenshuPdfEvidence;
    }
  | {
      readonly ok: false;
      readonly issues: readonly EvidenceIssue[];
    };

const MEDIA_BOX_TOLERANCE_PT = 0.01;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShape = ajv.compile<WenshuPdfEvidence>(evidenceSchema);

function makeIssue(code: EvidenceIssueCode, path: string): EvidenceIssue {
  return Object.freeze({ code, path });
}

function fail(issues: readonly EvidenceIssue[]): EvidenceValidationResult {
  return Object.freeze({ ok: false, issues: Object.freeze(issues) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapePathSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function errorParam(params: unknown, key: string): string | undefined {
  if (!isRecord(params)) {
    return undefined;
  }
  const value: unknown = params[key];
  return typeof value === "string" ? value : undefined;
}

function schemaIssuePath(error: {
  readonly instancePath: string;
  readonly keyword: string;
  readonly params: unknown;
}): string {
  const base = error.instancePath;
  if (error.keyword === "required") {
    const missing = errorParam(error.params, "missingProperty");
    if (missing !== undefined) {
      return `${base}/${escapePathSegment(missing)}`;
    }
  }
  if (error.keyword === "additionalProperties") {
    const extra = errorParam(error.params, "additionalProperty");
    if (extra !== undefined) {
      return `${base}/${escapePathSegment(extra)}`;
    }
  }
  return base || "/";
}

function validateSemantics(evidence: WenshuPdfEvidence): readonly EvidenceIssue[] {
  const issues: EvidenceIssue[] = [];
  const pageCount = evidence.source.pageCount;

  if (pageCount !== evidence.pages.length) {
    issues.push(makeIssue("PDF_EVIDENCE_SEMANTIC", "/source/pageCount"));
  }

  evidence.pages.forEach((page, index) => {
    const pagePath = `/pages/${index}`;
    if (page.index !== index) {
      issues.push(makeIssue("PDF_EVIDENCE_SEMANTIC", `${pagePath}/index`));
    }
    const [x0, y0, x1, y1] = page.mediaBox;
    if (x0 !== undefined && y0 !== undefined && x1 !== undefined && y1 !== undefined) {
      if (Math.abs(x1 - x0 - page.widthPt) > MEDIA_BOX_TOLERANCE_PT) {
        issues.push(makeIssue("PDF_EVIDENCE_SEMANTIC", `${pagePath}/widthPt`));
      }
      if (Math.abs(y1 - y0 - page.heightPt) > MEDIA_BOX_TOLERANCE_PT) {
        issues.push(makeIssue("PDF_EVIDENCE_SEMANTIC", `${pagePath}/heightPt`));
      }
    }
  });

  const orderedRuns = evidence.textRuns
    .map((run, index) => ({ index, readingOrder: run.readingOrder }))
    .sort(
      (left, right) =>
        left.readingOrder - right.readingOrder || left.index - right.index,
    );
  orderedRuns.forEach((entry, rank) => {
    if (entry.readingOrder !== rank) {
      issues.push(
        makeIssue("PDF_EVIDENCE_SEMANTIC", `/textRuns/${entry.index}/readingOrder`),
      );
    }
  });

  evidence.textRuns.forEach((run, index) => {
    if (run.pageIndex >= pageCount) {
      issues.push(makeIssue("PDF_EVIDENCE_SEMANTIC", `/textRuns/${index}/pageIndex`));
    }
  });
  evidence.figures.forEach((figure, index) => {
    if (figure.pageIndex >= pageCount) {
      issues.push(makeIssue("PDF_EVIDENCE_SEMANTIC", `/figures/${index}/pageIndex`));
    }
  });

  return issues;
}

export function validateEvidence(input: unknown): EvidenceValidationResult {
  const inspection = inspectData(input, {
    maxDepth: 64,
    maxNodes: 100_000,
  });
  if (!inspection.ok) {
    return fail([makeIssue("PDF_EVIDENCE_STRUCTURE", inspection.path)]);
  }

  if (
    isRecord(input) &&
    "evidenceVersion" in input &&
    input["evidenceVersion"] !== EVIDENCE_VERSION
  ) {
    return fail([makeIssue("PDF_EVIDENCE_VERSION", "/evidenceVersion")]);
  }

  if (!validateShape(input)) {
    const issues = (validateShape.errors ?? []).map((error) =>
      makeIssue("PDF_EVIDENCE_SCHEMA", schemaIssuePath(error)),
    );
    return fail(issues);
  }

  const semanticIssues = validateSemantics(input);
  if (semanticIssues.length > 0) {
    return fail(semanticIssues);
  }

  return Object.freeze({ ok: true, value: cloneAndFreeze(input) });
}
