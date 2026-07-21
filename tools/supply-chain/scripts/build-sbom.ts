import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildSbom, serializeSbom } from "../src/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const sbom = await buildSbom(workspaceRoot);
await mkdir(join(workspaceRoot, "sbom"), { recursive: true });
await writeFile(join(workspaceRoot, "sbom", "sbom.json"), serializeSbom(sbom), "utf8");
const direct = sbom.packages.filter((entry) => entry.direct).length;
console.log(
  `SBOM written: ${sbom.packages.length} packages (${direct} direct, ` +
    `${sbom.packages.length - direct} transitive).`,
);
