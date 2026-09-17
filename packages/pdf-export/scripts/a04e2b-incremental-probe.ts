/**
 * A-04E-2b 增量分页机制探针（决策 #25；纯机制测量，不做预算判定）。
 *
 * 回答四个机制事实问题，决定增量架构形态：
 *  1. CDP pageRanges 打印的成本是否随页数缩放（整份 vs 2 页 vs 10 页 vs 6 页）；
 *  2. pageRanges 产物是否带文档大纲（决定 TOC 页码能否从 ranged print 测量）；
 *  3. ranged print 的页内容与整份 print 同序页是否证据级全等
 *     （归一化 text/baselineY/bbox.x/fontSize，tag 单列——资源名为每打印会话分配）；
 *  4. 持久会话内热 navigate（同文档二次加载）的耗时量级。
 *
 * 边界：本机（Win10/任意 Chromium 150+）只产出机制证据；预算判定归 Win11 参考 VM。
 * 用法：node packages/pdf-export/scripts/a04e2b-incremental-probe.ts
 *       --out <dir> --fixture-root <dir> [--browser <path>]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { platform, release, arch } from "node:os";
import { resolve } from "node:path";

import { collectTocEntries } from "@wenshu/document-model";
import { importMarkdownDocument } from "@wenshu/markdown-import";
import {
  launchBrowser,
  parseFontPlan,
  renderDocumentHtml,
  startStaticServer,
  verifyFontFiles,
} from "@wenshu/report-render";
import { renderTemplateCss } from "@wenshu/template-css";
import { mapTemplate, parseApprovedFontSet } from "@wenshu/template-map";

import { extractGeometry, type GeometryTextRun } from "../src/geometry.ts";
import {
  composePrintDocument,
  fillTocPlaceholders,
  measureTocPageNumbers,
} from "../src/index.ts";
import { buildPrintParams } from "../src/print-params.ts";
import { normalizePdfText } from "../src/reconcile.ts";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const repoRoot = resolve(import.meta.dirname, "../../..");
const outDir = resolve(argValue("--out") ?? resolve(repoRoot, "tmp/a04e-2b-probe"));
const fixtureRoot = resolve(
  argValue("--fixture-root") ?? resolve(repoRoot, "tmp/a04e-2b-input"),
);
const fixture = resolve(fixtureRoot, "pa-13-performance-30-page.md");
const templatePath = resolve(fixtureRoot, "formal-business.template.json");
const browserPath = argValue("--browser");
const fontDir = resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R");

await mkdir(outDir, { recursive: true });

// ---- 装配（与 produceBaselinePdf 同序列，只到 compose 为止；探针自有服务器与会话） ----
const imported = await importMarkdownDocument(fixture, fixtureRoot);
const manifest = JSON.parse(
  await readFile(resolve(fontDir, "font-manifest.json"), "utf8"),
);
const plan = parseFontPlan(manifest);
await verifyFontFiles(fontDir, plan);
const fontSet = parseApprovedFontSet(manifest);
if (!fontSet.ok) throw new Error("font manifest must parse");
const mapped = mapTemplate(
  JSON.parse(await readFile(templatePath, "utf8")),
  fontSet.value,
);
if (!mapped.ok) throw new Error(`template must map: ${JSON.stringify(mapped.issues)}`);
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
      new TextDecoder().decode(await readFile(resolve(fixtureRoot, original))),
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
    return original === undefined ? undefined : svgCache.get(original);
  },
);
const printParams = buildPrintParams(model);
const tocEntries = collectTocEntries(imported.document);
if (tocEntries.length === 0) throw new Error("probe corpus must have a TOC");
const printHtml = fillTocPlaceholders(basePrintHtml, tocEntries);

const documents: Record<string, string | Uint8Array> = { "/print.html": printHtml };
for (const [original, normalized] of Object.entries(imported.renames)) {
  documents[`/${normalized}`] = await readFile(resolve(fixtureRoot, original));
}
const server = await startStaticServer(
  [{ mount: "/fonts/", directory: fontDir }],
  documents,
);

const keyOf = (run: GeometryTextRun, withTag: boolean): string =>
  JSON.stringify([
    normalizePdfText(run.text),
    run.baselineY,
    run.bbox.x,
    run.fontSize,
    ...(withTag ? [run.font.tag] : []),
  ]);

interface RangeCompare {
  readonly range: string;
  readonly printMs: number;
  readonly pages: number;
  readonly mismatchNoTag: number;
  readonly mismatchWithTag: number;
  readonly comparedRuns: number;
  readonly firstMismatch?: string;
}

const report: Record<string, unknown> = {
  probe: "a-04e-2b-incremental",
  semantics:
    "机制探针：pageRanges 成本缩放 / ranged print 大纲 / 页级证据等价 / 热 navigate",
  timestamp: new Date().toISOString(),
  environment: { platform: platform(), release: release(), arch: arch() },
  fixture,
  tocEntries: tocEntries.length,
};

const session = await launchBrowser(browserPath, {});
try {
  report["browserProduct"] = await session.productVersion();

  let t0 = performance.now();
  await session.navigate(`${server.origin}/print.html`);
  const navigateColdMs = performance.now() - t0;

  t0 = performance.now();
  const fullBytes1 = await session.printToPdf({ ...printParams });
  const printFullColdMs = performance.now() - t0;
  await writeFile(resolve(outDir, "full-1.pdf"), fullBytes1);
  const fullGeo = extractGeometry(fullBytes1);
  const fullPages = fullGeo.pages.length;
  const tocPages = measureTocPageNumbers(fullBytes1, tocEntries);

  t0 = performance.now();
  await session.navigate(`${server.origin}/print.html`);
  const navigateHotMs = performance.now() - t0;

  t0 = performance.now();
  const fullBytes2 = await session.printToPdf({ ...printParams });
  const printFullHotMs = performance.now() - t0;

  const ranges: Record<string, RangeCompare> = {};
  for (const range of ["5-6", "5-14", "25-30"]) {
    t0 = performance.now();
    const ranged = await session.printToPdf({ ...printParams, pageRanges: range });
    const printMs = performance.now() - t0;
    await writeFile(resolve(outDir, `range-${range}.pdf`), ranged);
    const geo = extractGeometry(ranged);
    const start = Number(range.split("-")[0]); // 1 基
    let mismatchNoTag = 0;
    let mismatchWithTag = 0;
    let comparedRuns = 0;
    let firstMismatch: string | undefined;
    for (let p = 0; p < geo.pages.length; p += 1) {
      const runsNew = geo.textRuns.filter((r) => r.pageIndex === p);
      const runsOld = fullGeo.textRuns.filter((r) => r.pageIndex === start - 1 + p);
      comparedRuns += Math.min(runsNew.length, runsOld.length);
      if (runsNew.length !== runsOld.length) {
        mismatchNoTag += 1;
        mismatchWithTag += 1;
        firstMismatch ??= `page ${start + p}: run count ranged ${runsNew.length} vs full ${runsOld.length}`;
        continue;
      }
      for (let i = 0; i < runsNew.length; i += 1) {
        const a = runsNew[i] as GeometryTextRun;
        const b = runsOld[i] as GeometryTextRun;
        if (keyOf(a, false) !== keyOf(b, false)) {
          mismatchNoTag += 1;
          firstMismatch ??= `page ${start + p} run ${i}:\n  ranged ${keyOf(a, false)}\n  full   ${keyOf(b, false)}`;
        }
        if (keyOf(a, true) !== keyOf(b, true)) mismatchWithTag += 1;
      }
    }
    ranges[range] = Object.freeze({
      range,
      printMs,
      pages: geo.pages.length,
      mismatchNoTag,
      mismatchWithTag,
      comparedRuns,
      ...(firstMismatch === undefined ? {} : { firstMismatch }),
    });
  }

  // ranged print 是否带大纲：对 "5-6" 产物跑 TOC 测量，记录解析结果或失败码
  const ranged56 = new Uint8Array(await readFile(resolve(outDir, "range-5-6.pdf")));
  let rangedOutline: unknown;
  try {
    const pages = measureTocPageNumbers(ranged56, tocEntries);
    rangedOutline = { resolved: pages.size, total: tocEntries.length };
  } catch (error) {
    rangedOutline = {
      error: error instanceof Error ? error.message : String(error),
      code: (error as { readonly code?: unknown }).code ?? null,
    };
  }

  // 证据提取成本（页级对账的预算分量）
  t0 = performance.now();
  extractGeometry(fullBytes2);
  const extractFullMs = performance.now() - t0;

  Object.assign(report, {
    navigateColdMs,
    navigateHotMs,
    printFullColdMs,
    printFullHotMs,
    fullPages,
    fullRuns: fullGeo.textRuns.length,
    tocResolvedFull: tocPages.size,
    ranges,
    rangedOutline,
    extractFullMs,
  });
  await writeFile(
    resolve(outDir, "probe-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await session.close();
  await server.close();
}
