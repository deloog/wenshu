/**
 * fault 样本派生共享助手（PA-12）：深拷贝派生（冻结基线不受影响）+
 * 锚点解析（归属/表格分析的真实坐标，禁硬编码猜测；锚点缺失即
 * GATE_FAULT_ANCHOR fail-closed，绝不悄悄换成软目标）。
 */
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";

import { ReportChecksError } from "./check-input.ts";
import type { GateFaultContext } from "./gate-input.ts";
import { attributeBlocks, bodyRunIndexesOnPage } from "./p1-attribution.ts";

export function faultAnchor(message: string): never {
  throw new ReportChecksError("GATE_FAULT_ANCHOR", message);
}

/** 内存派生 fault：深拷贝后注入缺陷，冻结基线证据不受影响。 */
export function deriveEvidence(
  baseline: WenshuPdfEvidence,
  mutate: (draft: WenshuPdfEvidence) => void,
): WenshuPdfEvidence {
  const draft = structuredClone(baseline) as WenshuPdfEvidence;
  mutate(draft);
  return draft;
}

/**
 * 指定块在指定页的正文 run（归属坐标系的真实 run，升序）。块必须在基线
 * 归属成功且该页确有 run，否则 fail-closed。
 */
export function blockRunsOnPage(
  context: GateFaultContext,
  blockRef: string,
  pageIndex: number,
): readonly TextRun[] {
  const attribution = attributeBlocks(context.baseline, context.expected);
  const entry = attribution.matched.find(
    (candidate) => candidate.block.ref === blockRef,
  );
  if (entry === undefined) {
    faultAnchor(`block ${blockRef} must attribute on the signed baseline`);
  }
  const runs = bodyRunIndexesOnPage(attribution, entry, pageIndex).map((runIndex) => {
    const run = attribution.orderedRuns[runIndex];
    if (run === undefined) {
      faultAnchor(`block ${blockRef} run index ${runIndex} out of range`);
    }
    return run;
  });
  if (runs.length === 0) {
    faultAnchor(`block ${blockRef} must have body runs on page ${pageIndex}`);
  }
  return runs;
}

/** 指定块归属的全部 run（跨页，归属坐标系升序）。 */
export function blockRuns(
  context: GateFaultContext,
  blockRef: string,
): readonly TextRun[] {
  const attribution = attributeBlocks(context.baseline, context.expected);
  const entry = attribution.matched.find(
    (candidate) => candidate.block.ref === blockRef,
  );
  if (entry === undefined) {
    faultAnchor(`block ${blockRef} must attribute on the signed baseline`);
  }
  return entry.runIndexes.map((runIndex) => {
    const run = attribution.orderedRuns[runIndex];
    if (run === undefined) {
      faultAnchor(`block ${blockRef} run index ${runIndex} out of range`);
    }
    return run;
  });
}

/** 按 readingOrder 集合在 draft 上执行搬移/删除。 */
export function mutateRunsByOrders(
  draft: WenshuPdfEvidence,
  orders: ReadonlySet<number>,
  mutate: (run: TextRun) => void,
): void {
  for (const run of draft.textRuns) {
    if (orders.has(run.readingOrder)) {
      mutate(run);
    }
  }
}
