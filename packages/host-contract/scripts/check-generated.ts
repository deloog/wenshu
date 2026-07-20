import { readFile } from "node:fs/promises";

import { generatedPath, renderHostTypes } from "./render-types.ts";

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
  manifest.wenshu.generatedFiles[0] !== "src/generated/host.ts"
) {
  throw new Error("Host generated file registry does not match the generator.");
}

const expected = await renderHostTypes();
const actual = await readFile(generatedPath, "utf8").catch(() => "");

if (actual !== expected) {
  throw new Error("Generated host types are stale; run pnpm generate.");
}
