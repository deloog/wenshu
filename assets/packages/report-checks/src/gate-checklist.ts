/**
 * 人工清单（PA-12 承接）：PA-A7/J1/K1/L1~L4/M1~M5/N1/N2 逐项登记承接
 * 方式。清单显式列出供人工核验，绝不并入自动检出统计（统一口径：
 * 自动检出只计 findings）。PA-J1/M1/N2 的 relatedCount 由 runner 以
 * 正常样本真实 manualChecks 计数动态填充（PA-08~11B 钉数 33）。
 */
import type { ManualChecklistItem } from "./generated/gate-report.ts";

interface ChecklistSeed {
  readonly itemId: string;
  readonly disposition: ManualChecklistItem["disposition"];
  readonly summary: string;
  readonly reference: string;
  /** true 时 relatedCount 填正常样本真实 manualChecks 总数。 */
  readonly pinsManualCount?: boolean;
}

const CHECKLIST_SEEDS: readonly ChecklistSeed[] = Object.freeze([
  {
    itemId: "PA-A7",
    disposition: "registered",
    summary:
      "front matter 非 title 键被静默丢弃且计入 syntaxChars：未关闭，风险册如实登记（markdown-import 域，非本闸门修复职责）。",
    reference: "docs/audits/PA-01-followups.md",
  },
  {
    itemId: "PA-J1",
    disposition: "carried",
    summary:
      "诚实降级人工核验项真实承接：正常样本 manualChecks 逐项列入本报告 samples，不当作已自动覆盖，不并入检出统计。",
    reference: "docs/audits/PA-08-followups.md",
    pinsManualCount: true,
  },
  {
    itemId: "PA-K1",
    disposition: "registered",
    summary:
      "表头窄巧合（续页首行数据与表头同文同列不可区分）为已知潜在漏检边界：风险册登记，12 fault 不声称覆盖该窄巧合。",
    reference: "docs/audits/PA-09-followups.md",
  },
  {
    itemId: "PA-L1",
    disposition: "carried",
    summary:
      "人工核验项口径更新（图片清晰度 2 项入清单）：已并入 PA-M1 钉数，随正常样本 manualChecks 逐项列出。",
    reference: "docs/audits/PA-10-followups.md",
  },
  {
    itemId: "PA-L2",
    disposition: "carried",
    summary:
      "图片域 findings 计入汇总统计：fault-p1-figure-aspect-distorted 及各图片规则在 executedRules；图遮正文仍落 PA-07（fault-p0-overlap），零重判。",
    reference: "docs/audits/PA-10-followups.md",
  },
  {
    itemId: "PA-L3",
    disposition: "external",
    summary:
      "受控 SVG 转换留痕的管线侧承接：需求池登记，无当前 owner，非本闸门职责；成员文本对账判据继续作独立对账。",
    reference: "docs/audits/PA-10-followups.md",
  },
  {
    itemId: "PA-L4",
    disposition: "registered",
    summary:
      "归属歧义边界（正文复述完整题注/来源降人工，不误报；「图N来源」前缀约定须模板层登记）：风险册登记。",
    reference: "docs/audits/PA-10-followups.md",
  },
  {
    itemId: "PA-M1",
    disposition: "carried",
    summary:
      "人工核验项口径 33（标题灰区 10 + 逐页密度 21 + 图清晰度 2）：以正常样本真实 manualChecks 计数钉定，逐项列入本报告。",
    reference: "docs/audits/PA-11A-followups.md",
    pinsManualCount: true,
  },
  {
    itemId: "PA-M2",
    disposition: "closed",
    summary:
      "PA-11B 已完成（审计 PASS，PR #21）；页码 fault 可注入化由本样本库 fault-p1-toc-page-mismatch 承接。",
    reference: "docs/audits/PA-11A-followups.md",
  },
  {
    itemId: "PA-M3",
    disposition: "registered",
    summary:
      "oracle 压印排除口径已知边界（pdf.js Type3 几何启发式近似；压印覆盖依赖对账链）：风险册登记，pdf-evidence 后续升级任务。",
    reference: "docs/audits/PA-11A-followups.md",
  },
  {
    itemId: "PA-M4",
    disposition: "external",
    summary: "VM 重签入口与 VM 内旧克隆备份处置：PA-05 环境承接，非本闸门域。",
    reference: "docs/audits/PA-11A-followups.md",
  },
  {
    itemId: "PA-M5",
    disposition: "registered",
    summary:
      "确定性判定口径：以剥离时间戳后 normalized sha 一致为准（run1=权威）；「原始字节逐位一致」主张须先推翻此登记。",
    reference: "docs/audits/PA-11A-followups.md",
  },
  {
    itemId: "PA-N1",
    disposition: "registered",
    summary:
      "归属级联语义下删除类 fault 目录域统一降全域人工（条目级 REVIEW 只在归属完整时可达）：已审定语义；fault-p1-toc-page-mismatch 采用跨页 fault 保持归属完整。",
    reference: "docs/audits/PA-11B-followups.md",
  },
  {
    itemId: "PA-N2",
    disposition: "carried",
    summary:
      "人工核验项口径仍 33（PA-11B 三规则零新增人工项）；若输入缺 headerText 页眉对账降人工，口径届时须重计。",
    reference: "docs/audits/PA-11B-followups.md",
    pinsManualCount: true,
  },
]);

export const MANUAL_CHECKLIST_ITEM_IDS: readonly string[] = Object.freeze(
  CHECKLIST_SEEDS.map((seed) => seed.itemId),
);

/**
 * 构建人工清单：静态承接登记 + 动态钉数（正常样本真实 manualChecks 总数，
 * 由 runner 实测传入——清单计数对真实产出诚实，不手写）。
 */
export function buildManualChecklist(
  normalManualCheckCount: number,
): readonly ManualChecklistItem[] {
  return Object.freeze(
    CHECKLIST_SEEDS.map((seed) =>
      Object.freeze({
        itemId: seed.itemId,
        disposition: seed.disposition,
        summary: seed.summary,
        reference: seed.reference,
        ...(seed.pinsManualCount === true
          ? { relatedCount: normalManualCheckCount }
          : {}),
      }),
    ),
  );
}
