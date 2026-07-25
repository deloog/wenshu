/**
 * 失败分类：损坏、加密、空、非自家管线结构的 PDF 必须以稳定问题码 + 定位
 * fail-closed，绝不静默产出空证据冒充成功。诊断不回显任何 PDF 内容。
 */

export type PdfEvidenceFailureCode =
  | "PDF_EVIDENCE_EMPTY"
  | "PDF_EVIDENCE_MALFORMED"
  | "PDF_EVIDENCE_ENCRYPTED"
  | "PDF_EVIDENCE_UNSUPPORTED";

export interface PdfEvidenceFailure {
  readonly code: PdfEvidenceFailureCode;
  /** 定位标签（header/eof/trailer/structure/producer/internal），不含文件内容。 */
  readonly location: string;
}

const PDF_MAGIC = "%PDF-";
const EOF_MARKER = "%%EOF";
const EOF_SCAN_WINDOW = 1024;

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

function failure(code: PdfEvidenceFailureCode, location: string): PdfEvidenceFailure {
  return Object.freeze({ code, location });
}

/**
 * 解析前置检查：在调用真实解析器之前完成空/头/截断/加密分类。
 * 返回 null 表示可以进入真实解析。
 */
export function preflightPdf(bytes: Uint8Array): PdfEvidenceFailure | null {
  if (bytes.length === 0) {
    return failure("PDF_EVIDENCE_EMPTY", "file");
  }
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, PDF_MAGIC.length)));
  if (head !== PDF_MAGIC) {
    return failure("PDF_EVIDENCE_MALFORMED", "header");
  }
  const tail = latin1(bytes.subarray(Math.max(0, bytes.length - EOF_SCAN_WINDOW)));
  if (!tail.includes(EOF_MARKER)) {
    return failure("PDF_EVIDENCE_MALFORMED", "eof");
  }
  // /Encrypt 只按整词匹配（Skia 自家产物从不出现）；命中即拒，不尝试解密。
  if (/\/Encrypt\b/.test(latin1(bytes))) {
    return failure("PDF_EVIDENCE_ENCRYPTED", "trailer");
  }
  return null;
}
