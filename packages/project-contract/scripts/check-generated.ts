import { readFile } from "node:fs/promises";

import { generatedPath, renderProjectContractTypes } from "./render-types.ts";

const expected = await renderProjectContractTypes();
const actual = await readFile(generatedPath, "utf8");

if (actual !== expected) {
  throw new Error("Generated project contract types are stale; run pnpm generate.");
}
if (/\bany\b/u.test(actual)) {
  throw new Error("Generated project contract types contain a forbidden keyword.");
}
