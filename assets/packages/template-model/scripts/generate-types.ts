import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { generatedPath, renderTemplateTypes } from "./render-types.ts";

await mkdir(dirname(generatedPath), { recursive: true });
await writeFile(generatedPath, await renderTemplateTypes(), "utf8");
