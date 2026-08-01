import { writeFile } from "node:fs/promises";

import { GENERATED_FILES } from "./render-types.ts";

for (const file of GENERATED_FILES) {
  await writeFile(file.path, await file.render());
}
