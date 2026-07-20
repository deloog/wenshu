import { readFile } from "node:fs/promises";

import { generatedPath, renderTemplateTypes } from "./render-types.ts";

const expected = await renderTemplateTypes();
const actual = await readFile(generatedPath, "utf8").catch(() => "");

if (actual !== expected) {
  throw new Error("Generated template types are stale; run pnpm generate.");
}
