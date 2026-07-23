import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  buildSbom,
  checkLicensePolicy,
  checkToolchainPins,
  parseSbom,
  serializeSbom,
  SupplyChainError,
} from "../src/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const sbomPath = join(workspaceRoot, "sbom", "sbom.json");

let committedText: string;
try {
  committedText = await readFile(sbomPath, "utf8");
} catch {
  throw new SupplyChainError("SBOM_INVALID", "committed sbom cannot be read");
}
let committedParsed: unknown;
try {
  committedParsed = JSON.parse(committedText);
} catch {
  throw new SupplyChainError("SBOM_INVALID", "committed sbom is not valid JSON");
}
parseSbom(committedParsed);

const rebuilt = await buildSbom(workspaceRoot);
if (serializeSbom(rebuilt) !== committedText) {
  throw new SupplyChainError(
    "SBOM_DRIFT",
    "committed sbom does not match the installed dependency tree",
  );
}
const findings = checkLicensePolicy(rebuilt.packages);
for (const finding of findings) {
  console.error(
    `ERROR license-policy ${finding.packageName}@${finding.version}: ` +
      `${finding.license} — ${finding.reason}`,
  );
}
if (findings.length > 0) {
  throw new SupplyChainError(
    "LICENSE_BLOCKED",
    "dependency tree contains forbidden or unreviewed licenses",
  );
}
const toolchainPins = await checkToolchainPins(workspaceRoot, rebuilt);
const direct = rebuilt.packages.filter((entry) => entry.direct).length;
console.log(
  `Supply chain check passed: ${rebuilt.packages.length} packages ` +
    `(${direct} direct), license policy clean, no drift, ` +
    `${toolchainPins.length} toolchain pins aligned.`,
);
