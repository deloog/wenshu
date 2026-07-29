import { PdfExportError } from "./errors.ts";

/**
 * 管线取消原语（PA-13）：各阶段边界显式检查 AbortSignal，已取消即以
 * PDF_EXPORT_CANCELLED 至终态；资源清理由调用处 try/finally 承担。
 * 取消不改变任何产物路径——未取消时信号参数是完全的 no-op。
 */
export interface PipelineCancellation {
  readonly signal?: AbortSignal | undefined;
}

export type PipelineStage = "import" | "compose" | "render" | "postprocess";

export function assertNotCancelled(
  cancellation: PipelineCancellation | undefined,
  stage: PipelineStage,
): void {
  if (cancellation?.signal?.aborted === true) {
    throw new PdfExportError(
      "PDF_EXPORT_CANCELLED",
      `baseline export cancelled at stage: ${stage}`,
    );
  }
}
