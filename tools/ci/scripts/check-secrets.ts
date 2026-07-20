import { spawnSync } from "node:child_process";

import { scanTrackedFiles } from "../src/secrets.ts";

const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (result.status !== 0) {
  throw new Error(result.stderr || "git ls-files failed");
}
const trackedFiles = (result.stdout ?? "").split("\0").filter(Boolean);
const findings = await scanTrackedFiles(process.cwd(), trackedFiles);
if (findings.length > 0) {
  findings.forEach((finding) => {
    console.error(`secret ${finding.filePath}: ${finding.reason}`);
  });
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed: ${trackedFiles.length} tracked files.`);
}
