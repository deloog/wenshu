import { readFile } from "node:fs/promises";

import { generatedPath, renderCheckReportTypes } from "./render-types.ts";

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
  manifest.wenshu.generatedFiles[0] !== "src/generated/check-report.ts"
) {
  throw new Error("Check report generated file registry does not match the generator.");
}

const expected = await renderCheckReportTypes();
const actual = await readFile(generatedPath, "utf8");

if (actual !== expected) {
  throw new Error("Generated check report types are stale; run pnpm generate.");
}

if (/\bany\b/u.test(actual)) {
  throw new Error("Generated check report types contain a forbidden type keyword.");
}
