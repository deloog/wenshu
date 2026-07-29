import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { composePrintDocument } from "@wenshu/pdf-export";
import { renderDocumentHtml } from "@wenshu/report-render";
import { renderTemplateCss } from "@wenshu/template-css";
import { mapTemplate, parseApprovedFontSet } from "@wenshu/template-map";

const root = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(root, "docs/poc-a/fixtures");
const output = resolve(
  root,
  "apps/arkweb-shell/entry/src/main/resources/rawfile/probe",
);
const fixture = await readFile(resolve(fixtureRoot, "golden-report.md"));
const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const manifest = JSON.parse(
  await readFile(
    resolve(root, "assets/fonts/source-han-sans-cn/2.005R/font-manifest.json"),
    "utf8",
  ),
);
const fontSet = parseApprovedFontSet(manifest);
if (!fontSet.ok) throw new Error("frozen font manifest must map");
const template = mapTemplate(
  JSON.parse(
    await readFile(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
  fontSet.value,
);
if (!template.ok) throw new Error("frozen template must map");
const css = renderTemplateCss(template.value, []);
const svgs = new Map();
for (const [source, normalized] of Object.entries(imported.renames)) {
  if (source.endsWith(".svg")) {
    svgs.set(normalized, await readFile(resolve(fixtureRoot, source), "utf8"));
  }
}
const printHtml = composePrintDocument(
  renderDocumentHtml(imported.document),
  css,
  (assetPath) => svgs.get(assetPath),
).replace(
  "</body>",
  `<script>\nwindow.__wenshuProbe = {\n  fixtureSha256: "${createHash("sha256").update(fixture).digest("hex")}",\n  semanticTextNodeCount: document.querySelectorAll("main *").length,\n  pageCount: "not_measured_without_ArkWeb_runtime",\n  lineWrapping: "not_measured_without_ArkWeb_runtime",\n  fontEmbedding: "not_supported_by_this_probe",\n  unsupportedCapabilities: ["print.pdf.export"],\n  hostRegistryExposed: typeof window.wenshuHost === "object"\n};\n</script></body>`,
);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "print.html"), printHtml);
await writeFile(
  resolve(output, "fixture.json"),
  `${JSON.stringify({ fixture_sha256: createHash("sha256").update(fixture).digest("hex") })}\n`,
);
await cp(resolve(fixtureRoot, "golden-report.md"), resolve(output, "golden-report.md"));
