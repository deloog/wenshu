/**
 * PA-12 fault 样本 · P1 对象域（PA-09/10/11B 检出域）：跨页表头未重复、
 * 图片比例失真、目录页码指错页（PA-11A 实际页码红线边界——实际页只从
 * 证据读）、页脚页码错码。锚点来自真实表格/归属/压印单源口径分析，
 * 缺失即 fail-closed。
 */
import { normalizePdfText } from "@wenshu/pdf-export";

import type { GateFaultSpec } from "./gate-input.ts";
import {
  blockRuns,
  deriveEvidence,
  faultAnchor,
  mutateRunsByOrders,
} from "./gate-fault-helpers.ts";
import { analyzeTables } from "./p1-tables.ts";
import { FOOTER_TEXT_PATTERN, selectStampRuns } from "./stamp-scope.ts";

/** 表 3（主要风险与首期处置）：基线唯一跨页表（p12→p13，探针实测）。 */
const TABLE3_ROOT = "/blocks/7/children/2/children/2/children/0";
/** 目录条目 7（2.2 任务边界）配对的正文标题块（基线 p5，探针实测）。 */
const HEAD7_REF = "/blocks/3/children/1";

const tableHeaderFault: GateFaultSpec = {
  sampleId: "fault-p1-table-header-not-repeated",
  severity: "P1",
  domain: "p1-table-header-repeat",
  summary: "删除跨页表续页 p13 页首的重复表头副本 run → 跨页表续页无表头。",
  expectedCodes: ["P1_TABLE_HEADER_NOT_REPEATED"],
  derive: (context) => {
    const analysis = analyzeTables(context.baseline, context.expected);
    const table3 = analysis.tables.find((table) => table.root === TABLE3_ROOT);
    if (table3 === undefined) {
      faultAnchor(`baseline cross-page table ${TABLE3_ROOT} must attribute`);
    }
    const dataOrders = table3.cells.flatMap((cell) =>
      cell.runIndexes.flatMap((runIndex) => {
        const run = analysis.orderedRuns[runIndex];
        return run !== undefined && run.pageIndex === 13 ? [run.readingOrder] : [];
      }),
    );
    if (dataOrders.length === 0) {
      faultAnchor("table 3 must have data runs on continuation page 13");
    }
    const firstDataOrder = Math.min(...dataOrders);
    const removed = context.baseline.textRuns.filter(
      (run) => run.pageIndex === 13 && run.readingOrder < firstDataOrder,
    );
    if (removed.length < 10) {
      faultAnchor("repeated header runs must exist on page 13");
    }
    const removedOrders = new Set(removed.map((run) => run.readingOrder));
    return deriveEvidence(context.baseline, (draft) => {
      draft.textRuns = draft.textRuns.filter(
        (run) => !removedOrders.has(run.readingOrder),
      );
    });
  },
};

const figureAspectFault: GateFaultSpec = {
  sampleId: "fault-p1-figure-aspect-distorted",
  severity: "P1",
  domain: "p1-figure-aspect",
  summary: "图 1 绘制框宽度放大 15% → paintBBox 比例偏离源 viewBox 超过容差。",
  expectedCodes: ["P1_FIGURE_ASPECT_DISTORTED"],
  derive: (context) =>
    deriveEvidence(context.baseline, (draft) => {
      const figure = draft.figures.find((candidate) => candidate.mcid === 0);
      if (figure === undefined) {
        faultAnchor("baseline figure 1 (mcid 0) must exist");
      }
      figure.paintBBox.width *= 1.15;
    }),
};

const tocPageFault: GateFaultSpec = {
  sampleId: "fault-p1-toc-page-mismatch",
  severity: "P1",
  domain: "p1-toc-page-match",
  summary:
    "目录条目 7 配对标题真实印刷页 p5→p6（标注未变）→ 标注页码 ≠ 实际页（实际页只从证据读）。",
  expectedCodes: ["P1_TOC_PAGE_MISMATCH"],
  derive: (context) => {
    const runs = blockRuns(context, HEAD7_REF);
    if (!runs.every((run) => run.pageIndex === 5)) {
      faultAnchor(`heading ${HEAD7_REF} must render on page 5 on the baseline`);
    }
    const orders = new Set(runs.map((run) => run.readingOrder));
    return deriveEvidence(context.baseline, (draft) => {
      mutateRunsByOrders(draft, orders, (run) => {
        run.pageIndex = 6;
      });
    });
  },
};

const footerPageFault: GateFaultSpec = {
  sampleId: "fault-p1-footer-page-mismatch",
  severity: "P1",
  domain: "p1-stamp-consistency",
  summary: "p4 页脚压印页码 5→6（物理页 pageIndex+1=5 不变）→ 页脚错码。",
  expectedCodes: ["P1_FOOTER_PAGE_MISMATCH"],
  derive: (context) => {
    const footer = selectStampRuns(context.baseline).find(
      (run) =>
        run.pageIndex === 4 && FOOTER_TEXT_PATTERN.test(normalizePdfText(run.text)),
    );
    if (footer === undefined) {
      faultAnchor("baseline must have a footer stamp run on page 4");
    }
    const footerOrder = footer.readingOrder;
    return deriveEvidence(context.baseline, (draft) => {
      const run = draft.textRuns.find(
        (candidate) => candidate.readingOrder === footerOrder,
      );
      if (run === undefined) {
        faultAnchor("footer stamp run must survive derivation");
      }
      run.text = "6 / 21";
    });
  },
};

export const P1_OBJECT_FAULT_SAMPLES: readonly GateFaultSpec[] = Object.freeze([
  tableHeaderFault,
  figureAspectFault,
  tocPageFault,
  footerPageFault,
]);
