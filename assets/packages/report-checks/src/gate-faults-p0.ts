/**
 * PA-12 fault 样本 · P0 域（PA-07 检出域）：页面尺寸、越界、遮挡（图遮
 * 正文，PA-K1 边界落 PA-07 成员制 paintBBox 判据）、内容缺失。每个样本
 * 注入真实缺陷并自签署基线确定性内存派生；锚点全部来自真实证据/归属
 * 分析，缺失即 fail-closed。
 */
import { normalizePdfText } from "@wenshu/pdf-export";

import type { GateFaultSpec } from "./gate-input.ts";
import { deriveEvidence, faultAnchor } from "./gate-fault-helpers.ts";
import { isStampRun } from "./stamp-scope.ts";

const pageSizeFault: GateFaultSpec = {
  sampleId: "fault-p0-page-size",
  severity: "P0",
  domain: "p0-page-size",
  summary: "第 4 页（pageIndex 3）页宽改为 700pt，偏离 A4 冻结尺寸。",
  expectedCodes: ["P0_PAGE_SIZE"],
  derive: (context) =>
    deriveEvidence(context.baseline, (draft) => {
      const page = draft.pages[3];
      if (page === undefined) {
        faultAnchor("baseline must have a page at index 3");
      }
      page.widthPt = 700;
    }),
};

const boundsFault: GateFaultSpec = {
  sampleId: "fault-p0-out-of-bounds",
  severity: "P0",
  domain: "p0-bounds",
  summary: "第 3 页（pageIndex 2）一个正文 run 挪到版心右侧之外 5pt。",
  expectedCodes: ["P0_OUT_OF_BOUNDS"],
  derive: (context) =>
    deriveEvidence(context.baseline, (draft) => {
      const run = draft.textRuns.find(
        (candidate) => candidate.pageIndex === 2 && candidate.bbox.width > 0,
      );
      if (run === undefined) {
        faultAnchor("baseline must have a body run on page 2");
      }
      run.bbox.x = context.contentBox.right + 5;
    }),
};

const overlapFault: GateFaultSpec = {
  sampleId: "fault-p0-overlap",
  severity: "P0",
  domain: "p0-overlap",
  summary:
    "图遮正文（PA-K1 边界）：p8 一个非成员正文 run 整体挪入图 1 绘制框中央（不骑缝）。",
  expectedCodes: ["P0_OVERLAP"],
  derive: (context) => {
    const figure = context.baseline.figures.find(
      (candidate) => candidate.pageIndex === 8,
    );
    if (figure === undefined) {
      faultAnchor("baseline must have a figure on page 8");
    }
    return deriveEvidence(context.baseline, (draft) => {
      const run = draft.textRuns.find(
        (candidate) =>
          candidate.pageIndex === 8 &&
          candidate.figureMcid === null &&
          !isStampRun(candidate),
      );
      if (run === undefined) {
        faultAnchor("baseline must have a non-member body run on page 8");
      }
      run.bbox.x = figure.paintBBox.x + 50;
      run.bbox.y = figure.paintBBox.y - 50;
    });
  },
};

const contentFault: GateFaultSpec = {
  sampleId: "fault-p0-content-missing",
  severity: "P0",
  domain: "p0-content",
  summary: "删除一个在证据中唯一出现的段落块全部覆盖 run（内容缺失）。",
  expectedCodes: ["P0_CONTENT_MISSING"],
  derive: (context) => {
    const ordered = [...context.baseline.textRuns].sort(
      (a, b) => a.readingOrder - b.readingOrder,
    );
    const normalized = ordered.map((run) => normalizePdfText(run.text));
    const joined = normalized.join("");
    const paragraph = context.expected.find(
      (block) =>
        block.ref.startsWith("/blocks/") &&
        !block.repeatable &&
        block.text.length >= 8 &&
        joined.indexOf(block.text) !== -1 &&
        joined.indexOf(block.text) === joined.lastIndexOf(block.text),
    );
    if (paragraph === undefined) {
      faultAnchor("baseline must contain a uniquely occurring paragraph block");
    }
    const start = joined.indexOf(paragraph.text);
    const end = start + paragraph.text.length;
    let offset = 0;
    const covering = new Set<number>();
    normalized.forEach((text, index) => {
      const runStart = offset;
      offset += text.length;
      if (runStart < end && offset > start) {
        const run = ordered[index];
        if (run !== undefined) {
          covering.add(run.readingOrder);
        }
      }
    });
    if (covering.size === 0) {
      faultAnchor("paragraph must cover at least one baseline run");
    }
    return deriveEvidence(context.baseline, (draft) => {
      draft.textRuns = draft.textRuns.filter((run) => !covering.has(run.readingOrder));
    });
  },
};

export const P0_FAULT_SAMPLES: readonly GateFaultSpec[] = Object.freeze([
  pageSizeFault,
  boundsFault,
  overlapFault,
  contentFault,
]);
