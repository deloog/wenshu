import { readFile } from "node:fs/promises";

import { generatedPath, renderEvidenceTypes } from "./render-types.ts";

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
  manifest.wenshu.generatedFiles[0] !== "src/generated/evidence.ts"
) {
  throw new Error("Evidence generated file registry does not match the generator.");
}

const expected = await renderEvidenceTypes();
const actual = await readFile(generatedPath, "utf8");

if (actual !== expected) {
  throw new Error("Generated evidence types are stale; run pnpm generate.");
}

if (/\bany\b/u.test(actual)) {
  throw new Error("Generated evidence types contain a forbidden type keyword.");
}
