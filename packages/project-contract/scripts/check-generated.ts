import { readFile } from "node:fs/promises";

import { generatedPath, renderProjectContractTypes } from "./render-types.ts";

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
  manifest.wenshu.generatedFiles[0] !== "src/generated/project-contract.ts"
) {
  throw new Error("Project generated file registry does not match the generator.");
}

const expected = await renderProjectContractTypes();
const actual = await readFile(generatedPath, "utf8");

if (actual !== expected) {
  throw new Error("Generated project contract types are stale; run pnpm generate.");
}
if (/\bany\b/u.test(actual)) {
  throw new Error("Generated project contract types contain a forbidden keyword.");
}
