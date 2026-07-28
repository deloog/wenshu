import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { STAMP_FONT_TAG_PREFIX } from "@wenshu/pdf-export";

const STAMP_TAG_PATTERN = new RegExp(`^${STAMP_FONT_TAG_PREFIX}\\d+$`, "u");

/**
 * 压印 run 排除（PA-11A 口径，ADR-0010）：页眉页脚是 pdf-export 在打印产物
 * 上以增量更新追加的受控补偿，钉在页边距带内、非文档内容——P0/P1 各域判定
 * （越界/遮挡/内容/稀疏/表格/图片）一律不评压印 run，也不让其参与期望块
 * 对位。识别依据是解析期事实：压印字体统一以 STAMP_FONT_TAG_PREFIX 资源
 * tag 登记（pdf-export 单源常量），禁止几何启发式（位置/字号猜测）。
 */
export function stripStampRuns(evidence: WenshuPdfEvidence): WenshuPdfEvidence {
  return Object.freeze({
    ...evidence,
    textRuns: evidence.textRuns.filter((run) => !STAMP_TAG_PATTERN.test(run.font.tag)),
  });
}
