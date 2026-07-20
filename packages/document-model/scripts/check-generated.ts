import { readFile } from "node:fs/promises";

import { generatedPath, renderDocumentTypes } from "./render-types.ts";

const expected = await renderDocumentTypes();
const actual = await readFile(generatedPath, "utf8");

if (actual !== expected) {
  throw new Error("Generated document types are stale; run pnpm generate.");
}

if (/\bany\b/u.test(actual)) {
  throw new Error("Generated document types contain a forbidden type keyword.");
}
