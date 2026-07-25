import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { generatedPath, renderCheckReportTypes } from "./render-types.ts";

await mkdir(dirname(generatedPath), { recursive: true });
await writeFile(generatedPath, await renderCheckReportTypes(), "utf8");
