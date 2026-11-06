import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { GENERATED_FILES } from "./render-types.ts";

for (const file of GENERATED_FILES) {
  await mkdir(dirname(file.path), { recursive: true });
  await writeFile(file.path, await file.render(), "utf8");
}
