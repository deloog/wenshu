/**
 * 发现问题码与构造：诊断只携带稳定 code + 页/节点定位 + 数值依据，
 * 绝不回显正文或字段值。P1（PA-08）另有人工核验项构造：凡无确定性
 * 或模板可溯源依据的判定，显式进入 manualChecks，绝不伪装自动覆盖。
 */
import type { Finding, ManualCheck } from "./generated/check-report.ts";

export type P0RuleId = "p0-page-size" | "p0-bounds" | "p0-overlap" | "p0-content";

export type P0Code =
  "P0_PAGE_SIZE" | "P0_OUT_OF_BOUNDS" | "P0_OVERLAP" | "P0_CONTENT_MISSING";

export type P1RuleId =
  | "p1-heading-keep"
  | "p1-orphan"
  | "p1-widow"
  | "p1-sparse-page"
  | "p1-table-header-repeat"
  | "p1-table-row-split"
  | "p1-figure-caption"
  | "p1-figure-source"
  | "p1-figure-aspect"
  | "p1-figure-fidelity"
  | "p1-figure-legibility";

/** P1_*_REVIEW 为人工核验码段：只出现在 manualChecks，绝不作为自动发现。 */
export type P1Code =
  | "P1_HEADING_SEPARATED"
  | "P1_ORPHAN"
  | "P1_WIDOW"
  | "P1_EMPTY_PAGE"
  | "P1_HEADING_KEEP_REVIEW"
  | "P1_SPARSE_DENSITY_REVIEW"
  | "P1_TABLE_HEADER_NOT_REPEATED"
  | "P1_TABLE_ROW_SPLIT"
  | "P1_TABLE_STRUCTURE_REVIEW"
  | "P1_FIGURE_CAPTION_SEPARATED"
  | "P1_FIGURE_SOURCE_SEPARATED"
  | "P1_FIGURE_ASPECT_DISTORTED"
  | "P1_FIGURE_CONTENT_MISMATCH"
  | "P1_FIGURE_FONT_NOT_EMBEDDED"
  | "P1_FIGURE_CAPTION_REVIEW"
  | "P1_FIGURE_SOURCE_REVIEW"
  | "P1_FIGURE_ASPECT_REVIEW"
  | "P1_FIGURE_LEGIBILITY_REVIEW";

export const P0_RULE_IDS: readonly P0RuleId[] = Object.freeze([
  "p0-page-size",
  "p0-bounds",
  "p0-overlap",
  "p0-content",
]);

export const P1_RULE_IDS: readonly P1RuleId[] = Object.freeze([
  "p1-heading-keep",
  "p1-orphan",
  "p1-widow",
  "p1-sparse-page",
  "p1-table-header-repeat",
  "p1-table-row-split",
  "p1-figure-caption",
  "p1-figure-source",
  "p1-figure-aspect",
  "p1-figure-fidelity",
  "p1-figure-legibility",
]);

export function runRef(readingOrder: number): string {
  return `run:${readingOrder}`;
}

export function figureRef(pageIndex: number, mcid: number): string {
  return `figure:${pageIndex}:${mcid}`;
}

export function pageRef(pageIndex: number): string {
  return `page:${pageIndex}`;
}

export function makeFinding(
  ruleId: P0RuleId | P1RuleId,
  code: P0Code | P1Code,
  pageIndex: number,
  nodeRef: string,
  metrics: Readonly<Record<string, number>>,
  relatedNodeRef?: string,
): Finding {
  return Object.freeze({
    ruleId,
    code,
    pageIndex,
    nodeRef,
    basis: Object.freeze({
      metrics: Object.freeze({ ...metrics }),
      ...(relatedNodeRef === undefined ? {} : { relatedNodeRef }),
    }),
  });
}

/** 人工核验项：reason 只能是静态口径文本（为何无法自动判定），绝不回显正文。 */
export function makeManualCheck(
  ruleId: P1RuleId,
  code: P1Code,
  pageIndex: number,
  nodeRef: string,
  reason: string,
  metrics: Readonly<Record<string, number>>,
  relatedNodeRef?: string,
): ManualCheck {
  return Object.freeze({
    ruleId,
    code,
    pageIndex,
    nodeRef,
    reason,
    basis: Object.freeze({
      metrics: Object.freeze({ ...metrics }),
      ...(relatedNodeRef === undefined ? {} : { relatedNodeRef }),
    }),
  });
}
