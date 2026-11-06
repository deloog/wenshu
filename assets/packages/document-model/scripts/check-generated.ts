import { readFile } from "node:fs/promises";

import { generatedPathOf, renderDocumentTypes, targets } from "./render-types.ts";

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
  manifest.wenshu.generatedFiles.length !== targets.length ||
  !targets.every(
    (target, index) =>
      (manifest.wenshu as { generatedFiles: unknown[] }).generatedFiles[index] ===
      target.generatedFile,
  )
) {
  throw new Error("Document generated file registry does not match the generator.");
}

for (const target of targets) {
  const expected = await renderDocumentTypes(target);
  const actual = await readFile(generatedPathOf(target), "utf8");

  if (actual !== expected) {
    throw new Error(
      `Generated document types are stale (${target.generatedFile}); run pnpm generate.`,
    );
  }

  if (/\bany\b/u.test(actual)) {
    throw new Error(
      `Generated document types contain a forbidden type keyword (${target.generatedFile}).`,
    );
  }
}
