/**
 * PA-12 fault 样本 · P1 布局域（PA-08 检出域）：标题与正文分离、孤行、
 * 寡行、整页留白。载体统一为基线 p2 执行摘要首段（/blocks/1/children/0，
 * 探针实测 ≥6 行）与 p5 整页；锚点来自真实归属分析，缺失即 fail-closed。
 */
import type { GateFaultContext, GateFaultSpec } from "./gate-input.ts";
import {
  blockRunsOnPage,
  deriveEvidence,
  mutateRunsByOrders,
} from "./gate-fault-helpers.ts";

/** p2 正文首段块（基线探针实测 6 行）——布局 fault 的统一载体。 */
const BODY_BLOCK_REF = "/blocks/1/children/0";

function bodyOrdersOnPage(
  context: GateFaultContext,
  pageIndex: number,
): readonly number[] {
  return blockRunsOnPage(context, BODY_BLOCK_REF, pageIndex).map(
    (run) => run.readingOrder,
  );
}

const headingFault: GateFaultSpec = {
  sampleId: "fault-p1-heading-separated",
  severity: "P1",
  domain: "p1-heading-keep",
  summary: "p2 正文首段整体移出 p2 → 标题在页尾 0 行后继（标题与正文分离）。",
  expectedCodes: ["P1_HEADING_SEPARATED"],
  derive: (context) => {
    const orders = new Set(bodyOrdersOnPage(context, 2));
    return deriveEvidence(context.baseline, (draft) => {
      mutateRunsByOrders(draft, orders, (run) => {
        run.pageIndex = 3;
      });
    });
  },
};

const orphanFault: GateFaultSpec = {
  sampleId: "fault-p1-orphan",
  severity: "P1",
  domain: "p1-orphan",
  summary: "p2 正文首段仅首行留在 p2、其余移到 p3 → 页尾 1 行 < orphans=2。",
  expectedCodes: ["P1_ORPHAN"],
  derive: (context) => {
    const runs = blockRunsOnPage(context, BODY_BLOCK_REF, 2);
    // y 向上：首行 baseline 最大。保留首行在 p2（孤行），其余移到 p3。
    const maxBaseline = Math.max(...runs.map((run) => run.baselineY));
    const keep = new Set(
      runs
        .filter((run) => Math.abs(run.baselineY - maxBaseline) <= 2)
        .map((run) => run.readingOrder),
    );
    const move = new Set(
      runs.map((run) => run.readingOrder).filter((order) => !keep.has(order)),
    );
    return deriveEvidence(context.baseline, (draft) => {
      mutateRunsByOrders(draft, move, (run) => {
        run.pageIndex = 3;
      });
    });
  },
};

const widowFault: GateFaultSpec = {
  sampleId: "fault-p1-widow",
  severity: "P1",
  domain: "p1-widow",
  summary: "p2 正文首段末行移到 p3 页首 → 页首 1 行 < widows=2。",
  expectedCodes: ["P1_WIDOW"],
  derive: (context) => {
    const runs = blockRunsOnPage(context, BODY_BLOCK_REF, 2);
    // 末行（baseline 最小）移到下页页首 → 寡行。
    const minBaseline = Math.min(...runs.map((run) => run.baselineY));
    const move = new Set(
      runs
        .filter((run) => Math.abs(run.baselineY - minBaseline) <= 2)
        .map((run) => run.readingOrder),
    );
    return deriveEvidence(context.baseline, (draft) => {
      mutateRunsByOrders(draft, move, (run) => {
        run.pageIndex = 3;
      });
    });
  },
};

const emptyPageFault: GateFaultSpec = {
  sampleId: "fault-p1-empty-page",
  severity: "P1",
  domain: "p1-sparse-page",
  summary: "删除 p5 全部内容 run 与图 → 整页零内容（如实副作用：该页压印同缺）。",
  expectedCodes: ["P1_EMPTY_PAGE"],
  derive: (context) =>
    deriveEvidence(context.baseline, (draft) => {
      draft.textRuns = draft.textRuns.filter((run) => run.pageIndex !== 5);
      draft.figures = draft.figures.filter((figure) => figure.pageIndex !== 5);
    }),
};

export const P1_LAYOUT_FAULT_SAMPLES: readonly GateFaultSpec[] = Object.freeze([
  headingFault,
  orphanFault,
  widowFault,
  emptyPageFault,
]);
