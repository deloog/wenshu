/**
 * 证据提取编排：真实解析（@wenshu/pdf-export 几何/检查原语，零 mock）→
 * 版本化证据模型。只提取几何与文本事实，不做任何质量判定。
 */
import { createHash } from "node:crypto";

import { extractGeometry, inspectPdf, PdfExportError } from "@wenshu/pdf-export";

import { preflightPdf, type PdfEvidenceFailure } from "./classify.ts";
import type { WenshuPdfEvidence } from "./generated/evidence.ts";
import { EVIDENCE_VERSION, validateEvidence } from "./validate.ts";

export type EvidenceExtractionResult =
  | { readonly ok: true; readonly evidence: WenshuPdfEvidence }
  | { readonly ok: false; readonly issue: PdfEvidenceFailure };

function failure(
  code: PdfEvidenceFailure["code"],
  location: string,
): EvidenceExtractionResult {
  return Object.freeze({ ok: false, issue: Object.freeze({ code, location }) });
}

/** 自家管线边界：Producer 必须来自 Skia/PDF（与 pdf-export 元数据政策同源事实）。 */
const PIPELINE_PRODUCER = /^Skia\/PDF/;

export function extractEvidence(bytes: Uint8Array): EvidenceExtractionResult {
  const preflight = preflightPdf(bytes);
  if (preflight !== null) {
    return Object.freeze({ ok: false, issue: preflight });
  }

  try {
    const inspection = inspectPdf(bytes);
    const geometry = extractGeometry(bytes);

    const producer = inspection.metadata["Producer"] ?? "";
    if (!PIPELINE_PRODUCER.test(producer)) {
      return failure("PDF_EVIDENCE_UNSUPPORTED", "producer");
    }

    const evidence: WenshuPdfEvidence = {
      evidenceVersion: EVIDENCE_VERSION,
      source: {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        pageCount: inspection.pageCount,
        producer,
      },
      pages: geometry.pages.map((page) => {
        const [x0, y0, x1, y1] = page.mediaBox;
        return {
          index: page.index,
          mediaBox: [...page.mediaBox],
          widthPt: (x1 ?? 0) - (x0 ?? 0),
          heightPt: (y1 ?? 0) - (y0 ?? 0),
          rotate: page.rotate,
        };
      }),
      // geometry.textRuns 已按 PA-05 阅读序（MCID 块序 → y 桶降序 → x 升序）
      // 逐页拼接返回；readingOrder 即该序列的全局序号。
      textRuns: geometry.textRuns.map((run, readingOrder) => ({
        pageIndex: run.pageIndex,
        text: run.text,
        bbox: { ...run.bbox },
        baselineY: run.baselineY,
        fontSize: run.fontSize,
        font: { ...run.font },
        blockOrder: run.blockOrder,
        readingOrder,
        viaActualText: run.viaActualText,
      })),
      figures: geometry.figures.map((figure) => ({
        pageIndex: figure.pageIndex,
        mcid: figure.mcid,
        bbox: { ...figure.bbox },
        kind: "vector-figure",
        altShort: figure.altShort,
        altLong: figure.altLong,
      })),
      fonts: inspection.fonts.map((font) => ({ ...font })),
    };

    // 产物必须满足自身冻结契约；不满足属内部缺陷，fail-closed 而非带病交付。
    const validation = validateEvidence(evidence);
    if (!validation.ok) {
      return failure("PDF_EVIDENCE_UNSUPPORTED", "internal-consistency");
    }
    return Object.freeze({ ok: true, evidence: validation.value });
  } catch (error) {
    if (error instanceof PdfExportError) {
      return failure("PDF_EVIDENCE_UNSUPPORTED", "structure");
    }
    throw error;
  }
}
