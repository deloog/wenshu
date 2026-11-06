import { PdfExportError } from "./errors.ts";
import type { ToUnicodeMap } from "./extract.ts";

/**
 * 目录页码字节级原地回填（决策 #21：占位符渲染 + 单遍渲染 + 原内容流改写）的
 * 共享事实层：错误出口、占位契约常量与跨模块扫描/配对类型。
 * compose 期目录条目页码占位 span 已填成三个占位数字 8（`888`），回填模块在
 * 大纲测量后把目录页内容流内的占位数字改写为实测页码：
 * - 前 n 个占位块的 Tj 十六进制码替换为目标数字在该字体 ToUnicode 反查的码
 *   （码长必须一致，不换字体）；
 * - 多余的占位块整段删除 `<…> Tj` 算子（BT/ET/Tf/Tm 空壳保留，BDC/EMC 不动，
 *   结构树 MCID 引用完好，提取侧无 run）。
 *
 * 纪律（与 pagination.ts 同款）：扫描器只认自家管线（Chromium/Skia）形态，
 * 未知构造、配对失配、反查歧义、几何漂移一律 fail-closed，绝不静默跳过。
 * 定位走「条目标题 → 紧随恰三个单字符 8 的 show 算子块」配对游标，禁裸搜
 * 字符串——正文天然含三连 8 的干扰组不会被触碰（配对游标在条目配齐后即停，
 * 正文页从不进入扫描）。
 */

export function fail(message: string): never {
  throw new PdfExportError("PDF_EXPORT_BACKFILL_FAILED", message);
}

/** 占位组槽位数（三个占位数字 8）。 */
export const PLACEHOLDER_SLOTS = 3;
/** 实测页码位数上限（corpus ≤30 页，契约上限 3 位）。 */
export const MAX_PAGE_DIGITS = 3;

export interface FontBinding {
  readonly fontObjectId: number;
  readonly toUnicode: ToUnicodeMap;
}

/** 一个 show 算子的扫描事实：解码文本、字节区间与字体归属。 */
export interface ShowToken {
  readonly contentObjectId: number;
  /** show 算子在解压内容流内的起始（含字符串操作数，不含前导空白）。 */
  readonly start: number;
  /** show 算子结束（不含）。 */
  readonly end: number;
  readonly fontObjectId: number;
  /** 解码字符序列（ActualText 包内取 ActualText 内容、去 FEFF）。 */
  readonly text: string;
  /** `<hex> Tj` 形式的十六进制串；其他形式（literal/TJ/ActualText）为 null。 */
  readonly hex: string | null;
  readonly viaActualText: boolean;
}

/** 归一化后的单字符及其来源 token（tokenIndex 为页内扫描序全局下标）。 */
export interface ScanChar {
  readonly char: string;
  readonly tokenIndex: number;
}

/** 配对成功的占位组。 */
export interface PlaceholderGroup {
  readonly entryId: string;
  /** 实测页码字符串（1–3 位）。 */
  readonly pageText: string;
  /** 恰三个连续单字符 `8` 的 show 算子 token。 */
  readonly slots: readonly ShowToken[];
  /** 三个占位字符在全局扫描字符序列中的位置（终验 run 映射用）。 */
  readonly charPositions: readonly number[];
}

export interface ScannedPage {
  readonly pageIndex: number;
  /** 本页字符在全局扫描字符序列中的起始。 */
  readonly charStart: number;
  readonly charCount: number;
}

/** 提取侧逐页归一化字符（逐字归一 + run 归属），与扫描字符序列同构。 */
export interface ExtractionChar {
  readonly char: string;
  readonly runIndex: number;
}
