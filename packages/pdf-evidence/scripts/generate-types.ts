import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { generatedPathOf, renderEvidenceTypes, targets } from "./render-types.ts";

for (const target of targets) {
  const path = generatedPathOf(target);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await renderEvidenceTypes(target), "utf8");
}
