import Ajv2020 from "ajv/dist/2020.js";
import { cloneAndFreeze, inspectData } from "@wenshu/contract-runtime";

import evidenceSchemaV1_0_0 from "../schema/evidence-1.0.0.schema.json" with { type: "json" };
import evidenceSchema from "../schema/evidence.schema.json" with { type: "json" };
import type { WenshuPdfEvidenceV1_0_0 } from "./generated/evidence-1.0.0.ts";
import type { WenshuPdfEvidence } from "./generated/evidence.ts";

/** 当前生产器版本；读取方同时接受冻结的 1.0.0（additive 升级纪律，决策 #10）。 */
export const EVIDENCE_VERSION = "1.1.0" as const;
export const SUPPORTED_EVIDENCE_VERSIONS = Object.freeze(["1.0.0", "1.1.0"] as const);

/** 读取方接受的支持版本证据：1.1.0（含成员标记/绘制框）或冻结 1.0.0。 */
export type SupportedEvidence = WenshuPdfEvidence | WenshuPdfEvidenceV1_0_0;

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
      readonly value: SupportedEvidence;
    }
  | {
      readonly ok: false;
      readonly issues: readonly EvidenceIssue[];
    };

const MEDIA_BOX_TOLERANCE_PT = 0.01;
const PAINT_WITHIN_BBOX_TOLERANCE_PT = 0.01;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateShapeV1_1_0 = ajv.compile<WenshuPdfEvidence>(evidenceSchema);
const validateShapeV1_0_0 = ajv.compile<WenshuPdfEvidenceV1_0_0>(evidenceSchemaV1_0_0);

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

function validateSemantics(evidence: SupportedEvidence): readonly EvidenceIssue[] {
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

  if (evidence.evidenceVersion === "1.1.0") {
    // 1.1.0 语义：成员标记必须引用同页已登记 figure；绘制框不得越出 bbox
    // （paint ⊆ bbox 是提取不变量：paintBox 的贡献者是 bbox 贡献者的子集）。
    const figureKeys = new Set(
      evidence.figures.map((figure) => `${figure.pageIndex}:${figure.mcid}`),
    );
    evidence.textRuns.forEach((run, index) => {
      if (run.figureMcid === null) {
        return;
      }
      if (!figureKeys.has(`${run.pageIndex}:${run.figureMcid}`)) {
        issues.push(
          makeIssue("PDF_EVIDENCE_SEMANTIC", `/textRuns/${index}/figureMcid`),
        );
      }
    });
    evidence.figures.forEach((figure, index) => {
      const paint = figure.paintBBox;
      if (paint.width === 0 && paint.height === 0) {
        return;
      }
      const box = figure.bbox;
      if (
        paint.x < box.x - PAINT_WITHIN_BBOX_TOLERANCE_PT ||
        paint.y > box.y + PAINT_WITHIN_BBOX_TOLERANCE_PT ||
        paint.x + paint.width > box.x + box.width + PAINT_WITHIN_BBOX_TOLERANCE_PT ||
        paint.y - paint.height < box.y - box.height - PAINT_WITHIN_BBOX_TOLERANCE_PT
      ) {
        issues.push(makeIssue("PDF_EVIDENCE_SEMANTIC", `/figures/${index}/paintBBox`));
      }
    });
  }

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

  const version = isRecord(input) ? input["evidenceVersion"] : undefined;
  if (
    version !== undefined &&
    !(SUPPORTED_EVIDENCE_VERSIONS as readonly unknown[]).includes(version)
  ) {
    return fail([makeIssue("PDF_EVIDENCE_VERSION", "/evidenceVersion")]);
  }

  if (version === "1.0.0") {
    if (!validateShapeV1_0_0(input)) {
      const issues = (validateShapeV1_0_0.errors ?? []).map((error) =>
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

  if (!validateShapeV1_1_0(input)) {
    const issues = (validateShapeV1_1_0.errors ?? []).map((error) =>
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
