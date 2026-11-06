import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import {
  launchBrowser,
  renderDocumentHtml,
  startStaticServer,
} from "@wenshu/report-render";
import { mapTemplate, parseApprovedFontSet } from "@wenshu/template-map";

import { renderTemplateCss, type CssFontFace } from "../src/index.ts";

const fixture = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/golden-report.md",
);
const fixtureRoot = resolve(fixture, "..");
const fontDir = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R",
);
const templatePath = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/formal-business.template.json",
);

const PT_TO_PX = 96 / 72;

interface ComputedProbe {
  bodyFontSize: string | null;
  bodyLineHeight: string | null;
  bodyColor: string | null;
  bodyFontFamily: string | null;
  h1FontSize: string | null;
  h2FontSize: string | null;
  h3FontSize: string | null;
  h4FontSize: string | null;
  headingColor: string | null;
  pMarginBottom: string | null;
  figcaptionFontSize: string | null;
  figcaptionColor: string | null;
  tableFontSize: string | null;
  thColor: string | null;
}

const COMPUTED_PROBE_EXPRESSION = `(() => {
  const read = (selector, prop) => {
    const el = document.querySelector(selector);
    return el === null ? null : getComputedStyle(el)[prop];
  };
  return {
    bodyFontSize: read("body", "fontSize"),
    bodyLineHeight: read("body", "lineHeight"),
    bodyColor: read("body", "color"),
    bodyFontFamily: read("body", "fontFamily"),
    h1FontSize: read("header h1", "fontSize"),
    h2FontSize: read("main h2", "fontSize"),
    h3FontSize: read("main h3", "fontSize"),
    h4FontSize: read("main h4", "fontSize"),
    headingColor: read("main h2", "color"),
    pMarginBottom: read("main p", "marginBottom"),
    figcaptionFontSize: read("figcaption", "fontSize"),
    figcaptionColor: read("figcaption", "color"),
    tableFontSize: read("table", "fontSize"),
    thColor: read("th", "color"),
  };
})()`;

function assertPx(actual: string | null, pt: number, label: string): void {
  assert.ok(actual !== null, `${label} must exist`);
  const px = Number.parseFloat(actual);
  assert.ok(
    Math.abs(px - pt * PT_TO_PX) < 0.02,
    `${label}: expected ≈${pt * PT_TO_PX}px, got ${actual}`,
  );
}

test("computed styles in a real browser match the mapped template tokens", async () => {
  // 决策 #9 调用点契约：fixtures 公共根。
  const imported = await importMarkdownDocument(fixture, fixtureRoot);
  const [rawTemplate, rawManifest] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(resolve(fontDir, "font-manifest.json"), "utf8"),
  ]);
  const fontSet = parseApprovedFontSet(JSON.parse(rawManifest));
  assert.ok(fontSet.ok);
  const mapped = mapTemplate(JSON.parse(rawTemplate), fontSet.value);
  if (!mapped.ok) {
    assert.fail("fixture template must map");
  }
  const model = mapped.value;
  const fontFaces: CssFontFace[] = model.fonts.faces.map((face) => ({
    weight: face.weight,
    src: `fonts/SourceHanSansCN-${face.style}.otf`,
  }));
  const css = renderTemplateCss(model, fontFaces);

  const html = renderDocumentHtml(imported.document).replace(
    "</head>",
    '<link rel="stylesheet" href="/style.css"></head>',
  );
  const documents: Record<string, string | Uint8Array> = {
    "/report.html": html,
    "/style.css": css,
  };
  for (const [original, normalized] of Object.entries(imported.renames)) {
    documents[`/${normalized}`] = await readFile(resolve(fixtureRoot, original));
  }
  const server = await startStaticServer(
    [{ mount: "/fonts/", directory: fontDir }],
    documents,
  );
  const browser = await launchBrowser();
  try {
    await browser.navigate(`${server.origin}/report.html`);
    const probe = await browser.evaluate<ComputedProbe>(COMPUTED_PROBE_EXPRESSION);
    // 字号（pt→px 换算真实值，非自述）
    assertPx(probe.bodyFontSize, 11, "body font-size");
    assertPx(probe.h1FontSize, 22, "doc title font-size");
    assertPx(probe.h2FontSize, 22, "section h2 font-size");
    assertPx(probe.h3FontSize, 16, "section h3 font-size");
    assertPx(probe.h4FontSize, 13, "section h4 font-size");
    assertPx(probe.figcaptionFontSize, 9, "caption font-size");
    assertPx(probe.tableFontSize, 9.5, "table font-size");
    assertPx(probe.pMarginBottom, 6, "paragraph spacing");
    // 行距（无单位 1.55 → 1.55 × 11pt 的 px）
    assert.ok(probe.bodyLineHeight !== null);
    assert.ok(
      Math.abs(Number.parseFloat(probe.bodyLineHeight) - 11 * PT_TO_PX * 1.55) < 0.02,
      `line-height: ${probe.bodyLineHeight}`,
    );
    // 四色（hex→rgb 真实换算）
    assert.equal(probe.bodyColor, "rgb(31, 41, 51)");
    assert.equal(probe.headingColor, "rgb(23, 50, 77)");
    assert.equal(probe.thColor, "rgb(46, 111, 149)");
    assert.equal(probe.figcaptionColor, "rgb(102, 115, 127)");
    // 字体族（无静默回落：family 只声明注册名）
    assert.ok(probe.bodyFontFamily?.includes("Source Han Sans CN"));
  } finally {
    await browser.close();
    await server.close();
  }
});
