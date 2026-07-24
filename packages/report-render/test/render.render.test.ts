import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";

import {
  SEMANTIC_SUMMARY_EXPRESSION,
  TEXT_SEQUENCE_EXPRESSION,
  RenderCheckError,
  assertFontsUsable,
  buildFontProbeExpression,
  documentTextSequence,
  launchBrowser,
  parseFontPlan,
  renderDocumentHtml,
  startStaticServer,
  verifyFontFiles,
  type FontLoadReport,
} from "../src/index.ts";

const fixture = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/golden-report.md",
);
const fixtureRoot = resolve(fixture, "..");
const fontDir = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R",
);
const evidenceDir = resolve(import.meta.dirname, "../../../test-results/report-render");

interface SemanticSummary {
  title: string | null;
  headings: number;
  sectionsLabeled: boolean;
  tables: number;
  thScoped: boolean;
  figures: number;
  figuresWithCaption: boolean;
  imagesWithAlt: boolean;
  pageBreaks: number;
  quotes: number;
  lists: number;
}

async function loadPlan() {
  const manifest = JSON.parse(
    await readFile(join(fontDir, "font-manifest.json"), "utf8"),
  );
  return parseFontPlan(manifest);
}

async function serveReport() {
  // 决策 #9 调用点契约：传 fixtures 公共根，非源文件目录。
  const result = await importMarkdownDocument(fixture, fixtureRoot);
  const html = renderDocumentHtml(result.document);
  const documents: Record<string, string | Uint8Array> = { "/report.html": html };
  for (const [original, normalized] of Object.entries(result.renames)) {
    documents[`/${normalized}`] = await readFile(join(fixtureRoot, original));
  }
  return { result, documents };
}

test("golden report renders semantically with verified real fonts", async (t) => {
  const [{ result, documents }, plan] = await Promise.all([serveReport(), loadPlan()]);
  await verifyFontFiles(fontDir, plan);
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: fontDir }],
    documents,
  );
  const browser = await launchBrowser();
  try {
    await browser.navigate(`${server.origin}/report.html`);
    const fontReport = await browser.evaluate<FontLoadReport>(
      buildFontProbeExpression(`${server.origin}/fonts/`, plan, "文枢AI排版12ab"),
    );
    assertFontsUsable(fontReport, plan);

    const semantics = await browser.evaluate<SemanticSummary>(
      SEMANTIC_SUMMARY_EXPRESSION,
    );
    assert.equal(semantics.title, result.document.title);
    assert.equal(semantics.headings, 41);
    assert.equal(semantics.sectionsLabeled, true);
    assert.equal(semantics.tables, 5);
    assert.equal(semantics.thScoped, true);
    assert.equal(semantics.figures, 2);
    assert.equal(semantics.figuresWithCaption, true);
    assert.equal(semantics.imagesWithAlt, true);
    assert.equal(semantics.pageBreaks, 1);
    assert.equal(semantics.quotes, 1);
    assert.ok(semantics.lists >= 1);

    const texts = await browser.evaluate<string[]>(TEXT_SEQUENCE_EXPRESSION);
    assert.deepEqual(texts, documentTextSequence(result.document));
  } catch (error) {
    await mkdir(evidenceDir, { recursive: true });
    await browser.screenshot(join(evidenceDir, "golden-failure.png"));
    t.diagnostic(`screenshot saved to ${evidenceDir}/golden-failure.png`);
    throw error;
  } finally {
    await browser.close();
    await server.close();
  }
});

test("missing or tampered font files fail closed before rendering", async () => {
  const plan = await loadPlan();
  const scratch = await mkdtemp(join(tmpdir(), "wenshu-fonts-"));
  try {
    // 缺一款字重：明确失败（weight 700 缺失）。
    const partial = join(scratch, "partial");
    await mkdir(partial);
    for (const face of plan.filter((entry) => entry.weight !== 700)) {
      await cp(join(fontDir, face.fileName), join(partial, face.fileName));
    }
    await assert.rejects(
      () => verifyFontFiles(partial, plan),
      (error: unknown) =>
        error instanceof RenderCheckError && error.code === "RENDER_FONT_INTEGRITY",
    );
    // 字节篡改一款字重：明确失败（哈希漂移）。
    const tampered = join(scratch, "tampered");
    await mkdir(tampered);
    for (const face of plan) {
      await cp(join(fontDir, face.fileName), join(tampered, face.fileName));
    }
    const victim = join(tampered, plan[0]?.fileName ?? "");
    const bytes = await readFile(victim);
    bytes[0] = bytes[0] === 0 ? 1 : 0;
    await writeFile(victim, bytes);
    await assert.rejects(
      () => verifyFontFiles(tampered, plan),
      (error: unknown) =>
        error instanceof RenderCheckError && error.code === "RENDER_FONT_INTEGRITY",
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("font weight that cannot load in the browser fails explicitly", async () => {
  const [{ documents }, plan] = await Promise.all([serveReport(), loadPlan()]);
  // 服务器故意不挂载字体目录：三款字体 URL 全部 404。
  const server = await startStaticServer([], documents);
  const browser = await launchBrowser();
  try {
    await browser.navigate(`${server.origin}/report.html`);
    const fontReport = await browser.evaluate<FontLoadReport>(
      buildFontProbeExpression(`${server.origin}/fonts/`, plan, "文枢AI排版12ab"),
    );
    assert.throws(
      () => assertFontsUsable(fontReport, plan),
      (error: unknown) =>
        error instanceof RenderCheckError && error.code === "RENDER_FONT_LOAD_FAILED",
    );
  } finally {
    await browser.close();
    await server.close();
  }
});

test("same font file fed to two weights is caught as wrong weight", async () => {
  const [{ documents }, plan] = await Promise.all([serveReport(), loadPlan()]);
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: fontDir }],
    documents,
  );
  const browser = await launchBrowser();
  try {
    await browser.navigate(`${server.origin}/report.html`);
    // 把 500 字重的 URL 换成 Regular 文件（模拟错字重映射）：量宽与 400 撞合。
    const swapped = plan.map((face) =>
      face.weight === 500
        ? {
            ...face,
            fileName:
              plan.find((entry) => entry.weight === 400)?.fileName ?? face.fileName,
          }
        : face,
    );
    const fontReport = await browser.evaluate<FontLoadReport>(
      buildFontProbeExpression(`${server.origin}/fonts/`, swapped, "文枢AI排版12ab"),
    );
    assert.throws(
      () => assertFontsUsable(fontReport, swapped),
      (error: unknown) =>
        error instanceof RenderCheckError && error.code === "RENDER_FONT_FALLBACK",
    );
  } finally {
    await browser.close();
    await server.close();
  }
});

test("verify wiring cannot omit the report render package", async () => {
  const packagePath = resolve(import.meta.dirname, "../../../package.json");
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  const scripts = (parsed as Record<string, unknown>)["scripts"];
  const contracts = String((scripts as Record<string, unknown>)["contracts:test"]);
  assert.match(contracts, /@wenshu\/report-render/u);
});
