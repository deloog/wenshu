/**
 * A-04E-2b 工装（决策 #25 D1，非产品）：增量更新对账——立即以
 * renderDocumentFull 整份重渲同文档为独立参照，比对窗页逐页 tag-free run
 * （runKeyTagFree）与 tocPages 逐项。只记录比对事实，不做过/不过判定
 * （判定归 VM 批次脚本）。
 */
import type { WenshuDocument } from "@wenshu/document-model";
import type { BrowserSession } from "@wenshu/report-render";

import { extractGeometry, type GeometryTextRun } from "../src/geometry.ts";
import { pageRuns, runKeyTagFree } from "../src/incremental.ts";
import type { IncrementalPreviewController } from "../src/incremental-controller.ts";
import {
  normalizePdfText,
  renderDocumentFull,
  type ExportContext,
} from "../src/index.ts";
import type { StampSpec } from "../src/stamp.ts";

import { SUBSTITUTION } from "./a04e2b-harness-edits.ts";

export interface ReconcileRecord {
  /** 独立参照整份重渲耗时（对账成本，非增量成本）。 */
  readonly referenceTotalMs: number;
  /** 窗页中 tag-free run 比对不一致的页（1 基）；空数组 = 逐页全等。 */
  readonly windowMismatchPages: readonly number[];
  readonly comparedRuns: number;
  readonly tocPagesEqual: boolean;
  readonly pageCountEqual: boolean;
  /** 编辑文本（「2b工装」前缀）确实落进窗页证据（非旧内容残留）。 */
  readonly editedTextVisibleInWindow: boolean;
}

export async function reconcileWindowAgainstFull(deps: {
  readonly context: ExportContext;
  readonly session: BrowserSession;
  readonly document: WenshuDocument;
  readonly stampSpec: StampSpec;
  readonly controller: IncrementalPreviewController;
  readonly targetPage0: number;
  readonly updatedRange: readonly [number, number];
  readonly pageCount: number;
  readonly tocPages: ReadonlyMap<string, number>;
}): Promise<ReconcileRecord> {
  const reference = await renderDocumentFull(
    deps.context,
    deps.session,
    deps.document,
    deps.stampSpec,
  );
  const refGeometry = extractGeometry(reference.contentBytes);
  const merged = deps.controller.state().geometry;
  const mismatchPages: number[] = [];
  let comparedRuns = 0;
  for (
    let page = deps.updatedRange[0] - 1;
    page <= deps.updatedRange[1] - 1;
    page += 1
  ) {
    const incremental = pageRuns(merged, page);
    const full = pageRuns(refGeometry, page);
    comparedRuns += Math.min(incremental.length, full.length);
    const equal =
      incremental.length === full.length &&
      incremental.every(
        (run, index) =>
          runKeyTagFree(run) === runKeyTagFree(full[index] as GeometryTextRun),
      );
    if (!equal) {
      mismatchPages.push(page + 1);
    }
  }
  const tocPagesEqual =
    deps.tocPages.size === reference.tocPages.size &&
    [...deps.tocPages.entries()].every(
      ([id, page]) => reference.tocPages.get(id) === page,
    );
  const editedVisible =
    deps.controller
      .state()
      .pageTextIndex[deps.targetPage0]?.includes(normalizePdfText(SUBSTITUTION)) ===
    true;
  return Object.freeze({
    referenceTotalMs: reference.timings.totalMs,
    windowMismatchPages: Object.freeze(mismatchPages),
    comparedRuns,
    tocPagesEqual,
    pageCountEqual: deps.pageCount === reference.pageCount,
    editedTextVisibleInWindow: editedVisible,
  });
}
