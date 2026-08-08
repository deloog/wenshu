/**
 * A-04E-2a 基线等价性探针（决策 #21「无视觉变化」承重点的实证，纯测量）：
 * 同引擎（本机 Chromium 同一进程版本）同语料同模板下——
 *   A 两遍自然宽版（旧管线形态）：空占位渲染 → 大纲测量 → 填实测页码 → 重渲；
 *   B 单遍占位回填版（新管线形态）：888 占位渲染 → 大纲测量 → backfill 字节改写。
 * 比对（任一不成立即结论「不等价」）：
 *   E0 两版大纲实测页码 map 完全一致（目录分页未位移的直接证据）；
 *   E1 页数一致；
 *   E2 非目录页：全 run 序列逐一项（text/baselineY/bbox.x/fontSize/font tag）一致；
 *   E3 目录页：剔除条目页码数字 run 后，剩余 run 序列逐项一致（含标题几何——
 *      折行差异会在此暴露）；
 *   E4 数字 run 位置量化：首数字 x 应与 A 版一致（同标题末位），后续数字 x
 *      偏移 = w(8) − w(实际数字)（逐条列出，验证数字等宽假设）。
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { collectTocEntries, type TocEntry } from "@wenshu/document-model";
import { importMarkdownDocument } from "@wenshu/markdown-import";
import {
  launchBrowser,
  parseFontPlan,
  renderDocumentHtml,
  startStaticServer,
  verifyFontFiles,
  type BrowserSession,
} from "@wenshu/report-render";
import { renderTemplateCss } from "@wenshu/template-css";
import { mapTemplate, parseApprovedFontSet } from "@wenshu/template-map";

import { backfillTocPageNumbers } from "../src/backfill-toc.ts";
import {
  composePrintDocument,
  fillTocPageNumbers,
  fillTocPlaceholders,
} from "../src/compose.ts";
import { extractGeometry, type GeometryTextRun } from "../src/geometry.ts";
import { measureTocPageNumbers } from "../src/pagination.ts";
import { buildPrintParams } from "../src/print-params.ts";
import { normalizePdfText } from "../src/reconcile.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(repoRoot, "docs/poc-a/fixtures");
const fontDir = resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R");

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const manifest = JSON.parse(await readFile(resolve(fontDir, "font-manifest.json"), "utf8"));
const plan = parseFontPlan(manifest);
await verifyFontFiles(fontDir, plan);
const fontSet = parseApprovedFontSet(manifest);
if (!fontSet.ok) throw new Error("font manifest must parse");
const mapped = mapTemplate(
  JSON.parse(await readFile(resolve(fixtureRoot, "formal-business.template.json"), "utf8")),
  fontSet.value,
);
if (!mapped.ok) throw new Error("template must map");
const css = renderTemplateCss(
  mapped.value,
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
      ([, n]) => n === assetPath,
    )?.[0];
    return original === undefined ? undefined : svgCache.get(original);
  },
);
const printParams = buildPrintParams(mapped.value);
const entries = collectTocEntries(imported.document);
if (entries.length === 0) throw new Error("fixture must have toc entries");

async function renderHtml(
  session: BrowserSession,
  origin: string,
  documents: Record<string, string | Uint8Array>,
  html: string,
): Promise<Uint8Array> {
  documents["/print.html"] = html;
  await session.navigate(`${origin}/print.html`);
  return session.printToPdf({ ...printParams });
}

const documents: Record<string, string | Uint8Array> = { "/print.html": basePrintHtml };
for (const [original, normalized] of Object.entries(imported.renames)) {
  documents[`/${normalized}`] = await readFile(resolve(fixtureRoot, original));
}
const server = await startStaticServer(
  [{ mount: "/fonts/", directory: fontDir }],
  documents,
);
const session = await launchBrowser(undefined, {});
let twoPassBytes: Uint8Array;
let singlePassBytes: Uint8Array;
let measuredA: ReadonlyMap<string, number>;
let measuredB: ReadonlyMap<string, number>;
try {
  // A：两遍自然宽（旧管线形态）。
  const pass1 = await renderHtml(session, server.origin, documents, basePrintHtml);
  measuredA = measureTocPageNumbers(pass1, entries);
  twoPassBytes = await renderHtml(
    session,
    server.origin,
    documents,
    fillTocPageNumbers(basePrintHtml, entries, measuredA),
  );
  // B：单遍占位回填（新管线形态）。
  const placeholderBytes = await renderHtml(
    session,
    server.origin,
    documents,
    fillTocPlaceholders(basePrintHtml, entries),
  );
  measuredB = measureTocPageNumbers(placeholderBytes, entries);
  singlePassBytes = backfillTocPageNumbers(placeholderBytes, entries, measuredB);
} finally {
  await session.close();
  await server.close();
}

// ---- E0：两版实测页码 map 一致（目录分页未位移） ----
const e0Mismatches = entries.filter(
  (entry) => measuredA.get(entry.id) !== measuredB.get(entry.id),
);

const geometryA = extractGeometry(twoPassBytes);
const geometryB = extractGeometry(singlePassBytes);

interface RunKey {
  readonly text: string;
  readonly baselineY: number;
  readonly x: number;
  readonly fontSize: number;
  readonly tag: string;
}
const keyOf = (run: GeometryTextRun): string =>
  JSON.stringify([
    normalizePdfText(run.text),
    run.baselineY,
    run.bbox.x,
    run.fontSize,
    run.font.tag,
  ]);

/** 目录页判定：以「目录」栏目起始的页（两版分别判定，不硬编码页号）。 */
function tocPageIndices(geometry: typeof geometryA): readonly number[] {
  const found: number[] = [];
  for (const page of geometry.pages) {
    const text = geometry.textRuns
      .filter((run) => run.pageIndex === page.index)
      .map((run) => normalizePdfText(run.text))
      .join("");
    if (text.startsWith("目录")) {
      found.push(page.index);
    }
  }
  // 目录可能跨页：从首页起，条目消耗未完即续页（本语料 36 条目单页，探针如实报告）。
  return found;
}

/** 目录页数字 run 剔除：条目游标定位标题末字后的连续纯数字 run（A/B 通用）。 */
function stripTocDigitRuns(
  geometry: typeof geometryA,
  tocPages: readonly number[],
): { readonly kept: readonly GeometryTextRun[]; readonly digitRuns: readonly GeometryTextRun[] } {
  const tocSet = new Set(tocPages);
  const kept: GeometryTextRun[] = [];
  const digitRuns: GeometryTextRun[] = [];
  for (const pageIndex of tocSet) {
    const pageRuns = geometry.textRuns.filter((run) => run.pageIndex === pageIndex);
    const consumed = new Set<number>();
    let cursor = 0;
    for (const entry of entries) {
      const titleChars = [...normalizePdfText(entry.title)];
      let at = -1;
      for (let index = cursor; index + titleChars.length <= pageRuns.length; index += 1) {
        if (
          titleChars.every(
            (char, offset) => normalizePdfText(pageRuns[index + offset]?.text ?? "") === char,
          )
        ) {
          at = index;
          break;
        }
      }
      if (at === -1) {
        continue; // 条目在后续目录页（跨页形态），游标不前进。
      }
      let index = at + titleChars.length;
      while (index < pageRuns.length && /^\d$/u.test(pageRuns[index]?.text ?? "")) {
        consumed.add(index);
        digitRuns.push(pageRuns[index] as GeometryTextRun);
        index += 1;
      }
      cursor = index;
    }
    pageRuns.forEach((run, index) => {
      if (!consumed.has(index)) {
        kept.push(run);
      }
    });
  }
  return Object.freeze({ kept: Object.freeze(kept), digitRuns: Object.freeze(digitRuns) });
}

const tocA = tocPageIndices(geometryA);
const tocB = tocPageIndices(geometryB);

// ---- E1/E2/E3：逐页比对 ----
const differences: string[] = [];
if (geometryA.pages.length !== geometryB.pages.length) {
  differences.push(
    `page count differs: two-pass ${geometryA.pages.length} vs single-pass ${geometryB.pages.length}`,
  );
}
const tocSetA = new Set(tocA);
const tocSetB = new Set(tocB);
const strippedA = stripTocDigitRuns(geometryA, tocA);
const strippedB = stripTocDigitRuns(geometryB, tocB);
for (const page of geometryA.pages) {
  const isToc = tocSetA.has(page.index) || tocSetB.has(page.index);
  const runsA = isToc
    ? strippedA.kept.filter((run) => run.pageIndex === page.index)
    : geometryA.textRuns.filter((run) => run.pageIndex === page.index);
  const runsB = isToc
    ? strippedB.kept.filter((run) => run.pageIndex === page.index)
    : geometryB.textRuns.filter((run) => run.pageIndex === page.index);
  if (runsA.length !== runsB.length) {
    differences.push(
      `page ${page.index}${isToc ? " (toc, digits stripped)" : ""}: run count ${runsA.length} vs ${runsB.length}`,
    );
    continue;
  }
  for (let index = 0; index < runsA.length; index += 1) {
    if (keyOf(runsA[index] as GeometryTextRun) !== keyOf(runsB[index] as GeometryTextRun)) {
      differences.push(
        `page ${page.index} run ${index}: ${keyOf(runsA[index] as GeometryTextRun)} vs ${keyOf(runsB[index] as GeometryTextRun)}`,
      );
      if (differences.length > 20) break;
    }
  }
  if (differences.length > 20) break;
}

// ---- E4：数字 run 位置量化（首数字 x 一致性 + 等宽假设） ----
const digitDeltas: unknown[] = [];
{
  const runsA = tocA.flatMap((page) =>
    geometryA.textRuns.filter((run) => run.pageIndex === page),
  );
  const runsB = tocB.flatMap((page) =>
    geometryB.textRuns.filter((run) => run.pageIndex === page),
  );
  // 逐条目取标题末字 run 与其后数字 run 序列。
  const entryDigits = (
    runs: readonly GeometryTextRun[],
  ): { titleEndX: number; digits: { text: string; x: number; width: number }[] }[] => {
    const out: { titleEndX: number; digits: { text: string; x: number; width: number }[] }[] = [];
    let cursor = 0;
    for (const entry of entries) {
      const titleChars = [...normalizePdfText(entry.title)];
      let at = -1;
      for (let index = cursor; index + titleChars.length <= runs.length; index += 1) {
        if (
          titleChars.every(
            (char, offset) => normalizePdfText(runs[index + offset]?.text ?? "") === char,
          )
        ) {
          at = index;
          break;
        }
      }
      if (at === -1) continue;
      let index = at + titleChars.length;
      const lastTitle = runs[index - 1] as GeometryTextRun;
      const digits: { text: string; x: number; width: number }[] = [];
      while (index < runs.length && /^\d$/u.test(runs[index]?.text ?? "")) {
        const run = runs[index] as GeometryTextRun;
        digits.push({ text: run.text, x: run.bbox.x, width: run.bbox.width });
        index += 1;
      }
      out.push({
        titleEndX: lastTitle.bbox.x + lastTitle.bbox.width,
        digits,
      });
      cursor = index;
    }
    return out;
  };
  const digitsA = entryDigits(runsA);
  const digitsB = entryDigits(runsB);
  entries.forEach((entry, index) => {
    const a = digitsA[index];
    const b = digitsB[index];
    if (a === undefined || b === undefined) {
      digitDeltas.push({ entry: entry.id, error: "entry not located" });
      return;
    }
    digitDeltas.push({
      entry: entry.id,
      twoPass: a.digits.map((digit) => `${digit.text}@${digit.x.toFixed(2)}(w${digit.width.toFixed(2)})`),
      singlePass: b.digits.map((digit) => `${digit.text}@${digit.x.toFixed(2)}(w${digit.width.toFixed(2)})`),
      titleEndDelta: b.titleEndX - a.titleEndX,
      firstDigitXDelta:
        (b.digits[0]?.x ?? Number.NaN) - (a.digits[0]?.x ?? Number.NaN),
    });
  });
}

console.log(
  JSON.stringify(
    {
      e0_measuredMapsIdentical: e0Mismatches.length === 0,
      e0_mismatches: e0Mismatches.map((entry) => entry.id),
      tocPages: { twoPass: tocA, singlePass: tocB },
      e1_pageCount: { twoPass: geometryA.pages.length, singlePass: geometryB.pages.length },
      e2e3_differences: differences,
      e2e3_equivalent: differences.length === 0,
      e4_digitPositions: digitDeltas.slice(0, 8),
      e4_firstDigitXDeltaMax: Math.max(
        ...digitDeltas.map((delta) =>
          Math.abs((delta as { firstDigitXDelta?: number }).firstDigitXDelta ?? 0),
        ),
      ),
    },
    null,
    1,
  ),
);
