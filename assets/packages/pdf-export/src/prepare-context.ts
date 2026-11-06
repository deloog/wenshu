import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { collectTocEntries, type TocEntry } from "@wenshu/document-model";
import { importMarkdownDocument, type ImportResult } from "@wenshu/markdown-import";
import {
  parseFontPlan,
  renderDocumentHtml,
  verifyFontFiles,
  type FontFacePlan,
} from "@wenshu/report-render";
import { renderTemplateCss } from "@wenshu/template-css";
import {
  mapTemplate,
  parseApprovedFontSet,
  type ControlledTemplate,
} from "@wenshu/template-map";

import { composePrintDocument } from "./compose.ts";
import { buildPrintParams, type PrintParams } from "./print-params.ts";
import type { BaselineInput } from "./pipeline.ts";

/** 导出上下文：管线导入+字体/模板/CSS 装配段的全部产物（A-04E-2b additive 接缝）。 */
export interface ExportContext {
  /** markdown 导入结果（文档/renames/metadata），装配顺序与读取顺序不变。 */
  readonly imported: ImportResult;
  /** 冻结字体清单解析出的字体计划（经 verifyFontFiles 落盘核验）。 */
  readonly plan: readonly FontFacePlan[];
  /** 受控模板模型（文档契约版本绑定 + 字体注册绑定，PA-02）。 */
  readonly model: ControlledTemplate;
  /** 白名单 CSS 解释器输出（PA-04）。 */
  readonly css: string;
  /** 模板派生的 printToPDF 参数。 */
  readonly printParams: PrintParams;
  /** 目录条目（document-model 唯一收录规则归口，PA-11A）。 */
  readonly tocEntries: readonly TocEntry[];
  /** SVG 原文缓存（renames 键 → 原文），compose 期回填用。 */
  readonly svgCache: ReadonlyMap<string, string>;
  /** 目录占位回填前的基座打印 HTML（含 SVG 内联回填）。 */
  readonly basePrintHtml: string;
  /** 冻结字体目录（输入透传，渲染段静态服务器挂载用）。 */
  readonly fontDir: string;
  /** fixture 根目录（输入透传，增量控制器的资产字节读取用）。 */
  readonly fixtureRoot: string;
}

/**
 * 管线装配段（A-04E-2b additive 提取）：markdown 导入 → 字体计划/核验 →
 * 模板绑定 → CSS 渲染 → SVG 缓存预填 → 基座 HTML compose → 打印参数 → 目录条目。
 * 调用序列与读取顺序与 produceBaselinePdf 原内联实现逐字节恒等。
 */
export async function prepareExportContext(
  input: BaselineInput,
): Promise<ExportContext> {
  const imported = await importMarkdownDocument(input.fixture, input.fixtureRoot);
  const manifest = JSON.parse(
    await readFile(resolve(input.fontDir, "font-manifest.json"), "utf8"),
  );
  const plan = parseFontPlan(manifest);
  await verifyFontFiles(input.fontDir, plan);

  const fontSet = parseApprovedFontSet(manifest);
  if (!fontSet.ok) {
    throw new Error("font manifest must parse");
  }
  const mapped = mapTemplate(
    JSON.parse(await readFile(input.templatePath, "utf8")),
    fontSet.value,
  );
  if (!mapped.ok) {
    throw new Error(`template must map: ${JSON.stringify(mapped.issues)}`);
  }
  const model = mapped.value;
  const css = renderTemplateCss(
    model,
    plan.map((face) => ({ weight: face.weight, src: `fonts/${face.fileName}` })),
  );
  const svgCache = new Map<string, string>();
  for (const original of Object.keys(imported.renames)) {
    if (original.toLowerCase().endsWith(".svg")) {
      svgCache.set(
        original,
        new TextDecoder().decode(await readFile(resolve(input.fixtureRoot, original))),
      );
    }
  }
  const basePrintHtml = composePrintDocument(
    renderDocumentHtml(imported.document),
    css,
    (assetPath) => {
      const original = Object.entries(imported.renames).find(
        ([, normalized]) => normalized === assetPath,
      )?.[0];
      if (original === undefined) {
        return undefined;
      }
      return svgCache.get(original);
    },
  );
  const printParams = buildPrintParams(model);
  const tocEntries = collectTocEntries(imported.document);
  return Object.freeze({
    imported,
    plan,
    model,
    css,
    printParams,
    tocEntries,
    svgCache,
    basePrintHtml,
    fontDir: input.fontDir,
    fixtureRoot: input.fixtureRoot,
  });
}
