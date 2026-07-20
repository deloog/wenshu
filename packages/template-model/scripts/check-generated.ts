import { readFile } from "node:fs/promises";

import { generatedPath, renderTemplateTypes } from "./render-types.ts";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as unknown;
if (
  typeof manifest !== "object" ||
  manifest === null ||
  !("wenshu" in manifest) ||
  typeof manifest.wenshu !== "object" ||
  manifest.wenshu === null ||
  !("generatedFiles" in manifest.wenshu) ||
  !Array.isArray(manifest.wenshu.generatedFiles) ||
  manifest.wenshu.generatedFiles.length !== 1 ||
  manifest.wenshu.generatedFiles[0] !== "src/generated/template.ts"
) {
  throw new Error("Template generated file registry does not match the generator.");
}

const expected = await renderTemplateTypes();
const actual = await readFile(generatedPath, "utf8").catch(() => "");

if (actual !== expected) {
  throw new Error("Generated template types are stale; run pnpm generate.");
}
