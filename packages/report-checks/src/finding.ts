/**
 * 发现问题码与构造：诊断只携带稳定 code + 页/节点定位 + 数值依据，
 * 绝不回显正文或字段值。
 */
import type { Finding } from "./generated/check-report.ts";

export type P0RuleId = "p0-page-size" | "p0-bounds" | "p0-overlap" | "p0-content";

export type P0Code =
  "P0_PAGE_SIZE" | "P0_OUT_OF_BOUNDS" | "P0_OVERLAP" | "P0_CONTENT_MISSING";

export const P0_RULE_IDS: readonly P0RuleId[] = Object.freeze([
  "p0-page-size",
  "p0-bounds",
  "p0-overlap",
  "p0-content",
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
  ruleId: P0RuleId,
  code: P0Code,
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
