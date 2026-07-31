import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkRepository } from "../src/check-repository.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const roadmapPath = resolve(workspaceRoot, "docs/implementation-roadmap.md");

const result = await checkRepository({ workspaceRoot, roadmapPath });
process.exitCode = result.exitCode;
