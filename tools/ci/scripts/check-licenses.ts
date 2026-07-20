import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  discoverInstalledPackageDirectories,
  forbiddenLicenseReason,
} from "../src/licenses.ts";

interface PackageManifest {
  readonly license?: string;
}

const workspaceRoot = process.cwd();
const locations = await discoverInstalledPackageDirectories(workspaceRoot);
const licenses = new Map<string, number>();
const failures: string[] = [];
for (const location of locations) {
  const manifest = JSON.parse(
    await readFile(join(location, "package.json"), "utf8"),
  ) as PackageManifest;
  const license = manifest.license;
  if (typeof license !== "string" || license.trim() === "") {
    failures.push(`${location}: missing license`);
    continue;
  }
  licenses.set(license, (licenses.get(license) ?? 0) + 1);
  const reason = forbiddenLicenseReason(license);
  if (reason !== undefined) {
    failures.push(`${location}: ${license} (${reason})`);
  }
}
if (failures.length > 0) {
  failures.forEach((failure) => console.error(`license ${failure}`));
  process.exitCode = 1;
} else {
  const summary = [...licenses.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([license, count]) => `${license}=${count}`)
    .join(", ");
  console.log(`License scan passed: ${locations.length} dependency paths; ${summary}`);
}
