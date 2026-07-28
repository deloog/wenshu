import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
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

/** 压印 run 识别（解析期事实：font tag 前缀；与排除口径同一单源）。 */
export function isStampRun(run: TextRun): boolean {
  return STAMP_TAG_PATTERN.test(run.font.tag);
}

/**
 * 选中压印 run（PA-11B 口径，ADR-0011 §4）：P0/P1 内容规则排除压印，
 * 而页眉页脚一致性检查的本职正是核验压印——两个方向共用本模块同一
 * 识别依据，禁止几何启发式（位置/字号猜测）另立口径。
 */
export function selectStampRuns(evidence: WenshuPdfEvidence): readonly TextRun[] {
  return Object.freeze(evidence.textRuns.filter(isStampRun));
}

/** 页脚压印文本归一后形态：`N/total`（归一去空白；原渲染为 `N / total`）。 */
export const FOOTER_TEXT_PATTERN = /^([0-9]+)\/([0-9]+)$/u;
