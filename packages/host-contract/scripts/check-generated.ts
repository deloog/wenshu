import { readFile } from "node:fs/promises";

import { generatedPath, renderHostTypes } from "./render-types.ts";

const expected = await renderHostTypes();
const actual = await readFile(generatedPath, "utf8").catch(() => "");

if (actual !== expected) {
  throw new Error("Generated host types are stale; run pnpm generate.");
}
