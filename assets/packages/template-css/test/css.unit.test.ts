import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  mapTemplate,
  parseApprovedFontSet,
  type ControlledTemplate,
} from "@wenshu/template-map";

import { renderTemplateCss, TemplateCssError, type CssFontFace } from "../src/index.ts";

const templatePath = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/formal-business.template.json",
);
const manifestPath = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R/font-manifest.json",
);

const FONT_FACES: readonly CssFontFace[] = [
  { weight: 400, src: "fonts/SourceHanSansCN-Regular.otf" },
  { weight: 500, src: "fonts/SourceHanSansCN-Medium.otf" },
  { weight: 700, src: "fonts/SourceHanSansCN-Bold.otf" },
];

async function loadModel(): Promise<ControlledTemplate> {
  const [rawTemplate, rawManifest] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  const fontSet = parseApprovedFontSet(JSON.parse(rawManifest));
  assert.ok(fontSet.ok, "frozen font manifest must parse");
  const mapped = mapTemplate(JSON.parse(rawTemplate), fontSet.value);
  if (!mapped.ok) {
    assert.fail(JSON.stringify(mapped.issues));
  }
  return mapped.value;
}

function clone(model: ControlledTemplate): ControlledTemplate {
  return JSON.parse(JSON.stringify(model)) as ControlledTemplate;
}

test("every whitelisted token maps into the expected CSS rules", async () => {
  const css = renderTemplateCss(await loadModel(), FONT_FACES);
  const expected = [
    "@page {\n  size: A4 portrait;\n  margin: 20mm 18mm 20mm 18mm;\n}",
    'font-family: "Source Han Sans CN";\n  font-style: normal;\n  font-weight: 400;\n  src: url("fonts/SourceHanSansCN-Regular.otf") format("opentype");',
    "font-weight: 500",
    "font-weight: 700",
    'body {\n  font-family: "Source Han Sans CN";\n  font-size: 11pt;\n  line-height: 1.55;\n  color: #1f2933;\n}',
    "header h1 {\n  font-size: 22pt;\n  color: #17324d;\n}",
    "main h2 {\n  font-size: 22pt;\n  color: #17324d;\n}",
    "main h3 {\n  font-size: 16pt;\n  color: #17324d;\n}",
    "main h4 {\n  font-size: 13pt;\n  color: #17324d;\n}",
    "p {\n  margin: 0 0 6pt 0;\n}",
    "figcaption {\n  font-size: 9pt;\n  color: #66737f;\n}",
    "table {\n  font-size: 9.5pt;\n}",
    "th {\n  color: #2e6f95;\n}",
    "p {\n  widows: 2;\n  orphans: 2;\n}",
    "header h1, main h2, main h3, main h4 {\n  break-after: avoid;\n}",
    "header {\n  break-after: page;\n}",
    ".toc {\n  break-before: page;\n}",
    "main h2 {\n  break-before: page;\n}",
    "thead {\n  display: table-header-group;\n}",
    "tr {\n  break-inside: avoid;\n}",
    "figure {\n  break-inside: avoid;\n}",
  ];
  for (const rule of expected) {
    assert.ok(css.includes(rule), `missing rule: ${rule.split("\n")[0]}`);
  }
});

test("only whitelisted selectors and declarations are emitted", async () => {
  const css = renderTemplateCss(await loadModel(), FONT_FACES);
  const selectors = css
    .split("}")
    .filter((chunk) => chunk.includes("{"))
    .map((chunk) => chunk.slice(0, chunk.indexOf("{")).trim())
    .filter((selector) => selector.length > 0 && !selector.startsWith("@"));
  assert.deepEqual(
    new Set(selectors),
    new Set([
      "body",
      "header h1",
      "main h2",
      "main h3",
      "main h4",
      "p",
      "figcaption",
      "table",
      "th",
      "header h1, main h2, main h3, main h4",
      "header",
      ".toc",
      "thead",
      "tr",
      "figure",
    ]),
  );
  // 无执行面与外联：url( 只能出现在 @font-face 的 src。
  assert.equal(css.includes("expression("), false);
  assert.equal(css.includes("@import"), false);
  const urlContexts = [...css.matchAll(/url\([^)]*\)/gu)].map((match) => match[0]);
  assert.equal(urlContexts.length, 3);
  for (const context of urlContexts) {
    assert.match(
      context,
      /^url\("fonts\/SourceHanSansCN-(Regular|Medium|Bold)\.otf"\)$/u,
    );
  }
});

test("CSS injection payloads in every value class are neutralized", async () => {
  const model = await loadModel();
  const colorPayloads = [
    "#17324D;}.evil{display:block}",
    "#17324D/*comment*/",
    "url(https://evil.example/x)",
    "expression(alert(1))",
    "#12345",
    "rgb(0,0,0)",
  ];
  for (const payload of colorPayloads) {
    const tampered = clone(model);
    (tampered.layoutTokens as unknown as Record<string, unknown>)["primary_color"] =
      payload;
    assert.throws(
      () => renderTemplateCss(tampered, FONT_FACES),
      (error: unknown) =>
        error instanceof TemplateCssError &&
        error.code === "TEMPLATE_CSS_VALUE_INVALID" &&
        error.path === "/layoutTokens/primary_color" &&
        !error.message.includes("evil") &&
        !error.message.includes("alert"),
      `color payload must be rejected: ${payload}`,
    );
  }
  const familyPayloads = ['Han";}.evil{', "Han</style><script>", "Han\\", "Han\n"];
  for (const payload of familyPayloads) {
    const tampered = clone(model);
    for (const face of tampered.fonts.faces) {
      (face as unknown as Record<string, unknown>)["family"] = payload;
    }
    assert.throws(
      () => renderTemplateCss(tampered, FONT_FACES),
      (error: unknown) =>
        error instanceof TemplateCssError && error.code === "TEMPLATE_CSS_FONT_INVALID",
      `family payload must be rejected: ${payload}`,
    );
  }
  const numberPayloads: unknown[] = [
    "11;}",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    999,
  ];
  for (const payload of numberPayloads) {
    const tampered = clone(model);
    (tampered.layoutTokens as unknown as Record<string, unknown>)["body_font_pt"] =
      payload;
    assert.throws(
      () => renderTemplateCss(tampered, FONT_FACES),
      (error: unknown) => error instanceof TemplateCssError,
      `number payload must be rejected: ${String(payload)}`,
    );
  }
  const urlPayloads = [
    "https://evil.example/x.otf",
    "../secret.otf",
    'fonts/x.otf";}.evil{',
    "/abs/path.otf",
    "fonts\\x.otf",
  ];
  for (const payload of urlPayloads) {
    assert.throws(
      () => renderTemplateCss(model, [{ weight: 400, src: payload }]),
      (error: unknown) =>
        error instanceof TemplateCssError && error.code === "TEMPLATE_CSS_FONT_INVALID",
      `url payload must be rejected: ${payload}`,
    );
  }
});

test("malformed models fail closed with stable codes and paths", async () => {
  const model = await loadModel();
  const cases: Array<[string, (tampered: ControlledTemplate) => void, string]> = [
    [
      "widows as string",
      (t) =>
        void ((t.paginationRules as unknown as Record<string, unknown>)["widows"] =
          "2"),
      "/paginationRules/widows",
    ],
    [
      "margin below range",
      (t) => void (t.page.margin_mm.top = 3),
      "/page/margin_mm/top",
    ],
    [
      "orientation sideways",
      (t) =>
        void ((t.page as unknown as Record<string, unknown>)["orientation"] =
          "sideways"),
      "/page/orientation",
    ],
    [
      "row break maybe",
      (t) =>
        void ((t.paginationRules as unknown as Record<string, unknown>)[
          "table_row_break_inside"
        ] = "sometimes"),
      "/paginationRules/table_row_break_inside",
    ],
    [
      "line height zero",
      (t) => void (t.layoutTokens.body_line_height = 0),
      "/layoutTokens/body_line_height",
    ],
  ];
  for (const [name, tamper, path] of cases) {
    const tampered = clone(model);
    tamper(tampered);
    assert.throws(
      () => renderTemplateCss(tampered, FONT_FACES),
      (error: unknown) => error instanceof TemplateCssError && error.path === path,
      name,
    );
  }
  // 未被模板绑定的字重来源同样拒绝。
  assert.throws(
    () => renderTemplateCss(model, [{ weight: 300, src: "fonts/x.otf" }]),
    (error: unknown) =>
      error instanceof TemplateCssError && error.code === "TEMPLATE_CSS_FONT_INVALID",
  );
});

test("verify wiring cannot omit the template css package", async () => {
  const packagePath = resolve(import.meta.dirname, "../../../package.json");
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  const scripts = (parsed as Record<string, unknown>)["scripts"];
  const contracts = String((scripts as Record<string, unknown>)["contracts:test"]);
  assert.match(contracts, /@wenshu\/template-css/u);
});
