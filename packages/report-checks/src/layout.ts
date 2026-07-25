/**
 * 页面规格与版心：A4 物理尺寸（PA-05/06 既定容差 1pt）与模板边距导出的
 * 内容盒。坐标为 PDF 用户空间（y 向上）：top 为大 y 边。
 */

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
export const PAGE_SIZE_TOLERANCE_PT = 1;

const PT_PER_MM = 72 / 25.4;

export interface MarginMm {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** y 向上内容盒：top = 页高 − 上边距（大 y），bottom = 下边距（小 y）。 */
export interface ContentBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function contentBoxFromMargins(
  margins: MarginMm,
  pageWidthPt: number,
  pageHeightPt: number,
): ContentBox {
  return Object.freeze({
    left: margins.left * PT_PER_MM,
    right: pageWidthPt - margins.right * PT_PER_MM,
    top: pageHeightPt - margins.top * PT_PER_MM,
    bottom: margins.bottom * PT_PER_MM,
  });
}
