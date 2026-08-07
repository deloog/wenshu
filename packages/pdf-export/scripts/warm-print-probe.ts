/**
 * A-04E warm-print probe（业主 2026-08-06 裁定）：同一 browser session 内连打两次整份 30 页，
 * 比较第一次（冷）与第二次（热）的 navigate+printToPDF 耗时，验证「成本结构=一次冷+一次热」推断。
 * 纯测量探针：无任何质量判定，不构成签署证据；错误自然抛出 fail-closed。
 * 用法：node packages/pdf-export/scripts/warm-print-probe.ts --out <dir> --browser <path>
 *       --fixture <md> --fixture-root <dir> --template <json>
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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

import { composePrintDocument } from "../src/compose.ts";
import { buildPrintParams } from "../src/print-params.ts";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const repoRoot = resolve(import.meta.dirname, "../../..");
const outDir = resolve(
  argValue("--out") ?? resolve(repoRoot, "test-results/a-04e-warm-probe"),
);
const browserPath = argValue("--browser");
const fixtureRoot = resolve(
  argValue("--fixture-root") ?? resolve(repoRoot, "docs/poc-a/fixtures"),
);
const fixture = resolve(
  argValue("--fixture") ?? resolve(fixtureRoot, "golden-report.md"),
);
const templatePath = resolve(
  argValue("--template") ?? resolve(fixtureRoot, "formal-business.template.json"),
);
const fontDir = resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R");

// 与 pipeline.ts 导入/组装段同调用同传参（只组装不判定）。
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
const documents: Record<string, string | Uint8Array> = { "/print.html": basePrintHtml };
for (const [original, normalized] of Object.entries(imported.renames)) {
  documents[`/${normalized}`] = await readFile(resolve(fixtureRoot, original));
}

interface PassTiming {
  pass: number;
  navigateMs: number;
  printMs: number;
  totalMs: number;
  pdfBytes: number;
}

const server = await startStaticServer(
  [{ mount: "/fonts/", directory: fontDir }],
  documents,
);
let result: Record<string, unknown>;
const browserStart = performance.now();
const session = await launchBrowser(browserPath, {});
try {
  const product = await session.productVersion();
  const browserMs = performance.now() - browserStart;
  const passes: PassTiming[] = [];
  for (const pass of [1, 2]) {
    const navStart = performance.now();
    await session.navigate(`${server.origin}/print.html`);
    const navigateMs = performance.now() - navStart;
    const printStart = performance.now();
    const pdf = await session.printToPdf({ ...printParams });
    const printMs = performance.now() - printStart;
    passes.push({
      pass,
      navigateMs,
      printMs,
      totalMs: navigateMs + printMs,
      pdfBytes: pdf.byteLength,
    });
  }
  const [pass1, pass2] = passes;
  if (!pass1 || !pass2) throw new Error("warm probe must produce two passes");
  result = {
    probe: "a-04e-warm-print",
    product,
    browserMs,
    pass1,
    pass2,
    printRatio2over1: pass2.printMs / pass1.printMs,
  };
} finally {
  await session.close();
  await server.close();
}

await mkdir(outDir, { recursive: true });
await writeFile(
  resolve(outDir, "warm-print-probe.json"),
  `${JSON.stringify(result, null, 1)}\n`,
  "utf8",
);
console.log(JSON.stringify(result));
