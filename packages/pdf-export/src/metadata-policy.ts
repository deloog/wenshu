import { PdfExportError } from "./errors.ts";
import type { PdfMetadata } from "./inspect.ts";

/** 允许存在的元数据键（其余一律视为上游/个人/组织身份残留风险）。 */
const ALLOWED_KEYS = new Set([
  "Title",
  "Producer",
  "Creator",
  "CreationDate",
  "ModDate",
]);

/**
 * 元数据卫生规则（书面化于实施记录 §元数据政策）：
 * - Title 保留且必须等于文档自身标题（受控值）；
 * - Producer/Creator 只允许引擎常量（Skia/PDF、Chromium），记录留证；
 * - Author/Company/Keywords 等一切上游作者/机构/工具身份字段必须不存在；
 * - 时间戳允许存在（确定性差异来源，如实记录）。
 */
export function assertMetadataPolicy(
  metadata: PdfMetadata,
  xmp: string | null,
  expectedTitle: string,
): void {
  for (const key of Object.keys(metadata)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new PdfExportError(
        "PDF_EXPORT_METADATA_POLICY",
        `unexpected metadata field: ${key}`,
      );
    }
  }
  if (metadata["Title"] !== expectedTitle) {
    throw new PdfExportError(
      "PDF_EXPORT_METADATA_POLICY",
      "pdf title must equal the document title",
    );
  }
  const producer = metadata["Producer"] ?? "";
  if (!/^Skia\/PDF/u.test(producer)) {
    throw new PdfExportError(
      "PDF_EXPORT_METADATA_POLICY",
      "pdf producer must be the engine constant",
    );
  }
  const creator = metadata["Creator"];
  // 引擎 UA 常量（Chromium/Edge 变体；含 OS 家族，无个人/机构身份），留证。
  if (
    creator !== undefined &&
    !/^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) (?:HeadlessChrome|Chrome)\/[\d.]+ Safari\/537\.36(?: Edg\/[\d.]+)?$/u.test(
      creator,
    )
  ) {
    throw new PdfExportError(
      "PDF_EXPORT_METADATA_POLICY",
      "pdf creator must be the engine UA constant or absent",
    );
  }
  if (xmp !== null && /author|company|creator(?!Tool)/iu.test(xmp)) {
    throw new PdfExportError(
      "PDF_EXPORT_METADATA_POLICY",
      "xmp metadata carries upstream identity",
    );
  }
}
