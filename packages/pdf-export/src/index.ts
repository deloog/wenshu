export * from "./compose.ts";
export * from "./cancellation.ts";
export * from "./errors.ts";
export * from "./inspect.ts";
export * from "./metadata-policy.ts";
export * from "./pipeline.ts";
export * from "./print-params.ts";
export * from "./reconcile.ts";
export * from "./cmap-repair.ts";
export * from "./pdf-patch.ts";
export * from "./geometry.ts";
export * from "./pagination.ts";
export * from "./stamp.ts";
export * from "./stamp-glyphs.ts";
// 目录收录规则唯一归口 document-model；经本包转出口供下游（pdf-evidence 等）
// 装配 TocExpectation，避免下游为测试再增直接依赖。
export { TOC_HEADING, collectTocEntries } from "@wenshu/document-model";
