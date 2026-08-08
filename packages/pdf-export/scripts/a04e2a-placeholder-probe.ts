/**
 * A-04E-2a 方案定型探针（实施期，纯测量，不构成签署证据）：
 * 「占位符渲染 + 字节级原地回填」机制的三个前提实证——
 * P1 占位数字（888）在提取中的 run 形态（独立 run 还是并入标题 run）；
 * P2 占位 run 在阅读序中的位置（是否紧随条目标题，即原内容流内天然落位）；
 * P3 0-9 全部数字的 resolveStampReps 可得性（A 路/B 路覆盖）。
 * 错误自然抛出 fail-closed。
 */
import { readFile } from "node:fs/promises";
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

import { composePrintDocument, fillTocPageNumbers } from "../src/compose.ts";
import { extractGeometry } from "../src/geometry.ts";
import { buildPrintParams } from "../src/print-params.ts";
import { resolveStampReps } from "../src/stamp-glyphs.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(repoRoot, "docs/poc-a/fixtures");
const fixture = resolve(fixtureRoot, "golden-report.md");
const templatePath = resolve(fixtureRoot, "formal-business.template.json");
const fontDir = resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R");

const imported = await importMarkdownDocument(fixture, fixtureRoot);
const manifest = JSON.parse(await readFile(resolve(fontDir, "font-manifest.json"), "utf8"));
const plan = parseFontPlan(manifest);
await verifyFontFiles(fontDir, plan);
const fontSet = parseApprovedFontSet(manifest);
if (!fontSet.ok) throw new Error("font manifest must parse");
const mapped = mapTemplate(
  JSON.parse(await readFile(templatePath, "utf8")),
  fontSet.value,
);
if (!mapped.ok) throw new Error(`template must map: ${JSON.stringify(mapped.issues)}`);
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
const tocEntries = collectTocEntries(imported.document);
if (tocEntries.length === 0) throw new Error("fixture must have toc entries");

// 占位回填：全部条目填 888（不渲染第二遍）。
const fakePages = new Map(tocEntries.map((entry) => [entry.id, 888]));
const filledHtml = fillTocPageNumbers(basePrintHtml, tocEntries, fakePages);

const documents: Record<string, string | Uint8Array> = { "/print.html": filledHtml };
for (const [original, normalized] of Object.entries(imported.renames)) {
  documents[`/${normalized}`] = await readFile(resolve(fixtureRoot, original));
}

const server = await startStaticServer(
  [{ mount: "/fonts/", directory: fontDir }],
  documents,
);
const session = await launchBrowser(undefined, {});
let pdf: Uint8Array;
try {
  await session.navigate(`${server.origin}/print.html`);
  pdf = await session.printToPdf({ ...printParams });
} finally {
  await session.close();
  await server.close();
}

const geometry = extractGeometry(pdf);

// P1/P2：定位含 888 的 run 及其在阅读序中的邻居。
const placeholderRuns = geometry.textRuns.filter((run) => run.text.includes("888"));
const sample = placeholderRuns.slice(0, 6).map((run) => {
  const pageRuns = geometry.textRuns.filter((r) => r.pageIndex === run.pageIndex);
  const idx = pageRuns.indexOf(run);
  const prev = idx > 0 ? pageRuns[idx - 1] : undefined;
  const next = idx < pageRuns.length - 1 ? pageRuns[idx + 1] : undefined;
  return {
    pageIndex: run.pageIndex,
    text: run.text,
    fontTag: run.font.tag,
    fontSize: run.fontSize,
    prevText: prev?.text,
    nextText: next?.text,
    indexOnPage: idx,
    totalOnPage: pageRuns.length,
  };
});

// P3：数字字形可得性。
const reps = resolveStampReps(pdf, [..."0123456789"]);
const repReport = [..."0123456789"].map((char) => {
  const rep = reps.get(char);
  return {
    char,
    resolved: rep !== undefined,
    via: rep === undefined ? null : rep.actualText === null ? "A" : "B",
    fontObjectId: rep?.fontObjectId ?? null,
  };
});

console.log(
  JSON.stringify(
    {
      tocEntryCount: tocEntries.length,
      placeholderRunCount: placeholderRuns.length,
      placeholderRunPages: [...new Set(placeholderRuns.map((r) => r.pageIndex))],
      sample,
      digitReps: repReport,
      digitRepsAllResolved: repReport.every((r) => r.resolved),
    },
    null,
    1,
  ),
);
