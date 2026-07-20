import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverWorkspaceFiles } from "@wenshu/test-support";

import {
  checkFileSize,
  checkForbiddenSyntax,
  checkStrictBaseConfig,
  checkTypecheckCoverage,
  type QualityFinding,
} from "../src/index.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const files = await discoverWorkspaceFiles(workspaceRoot);
const sourceFiles = files.filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/u.test(file));
const findings: QualityFinding[] = [];

for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  findings.push(...checkForbiddenSyntax(file, text));
  if (/\.(?:ts|tsx)$/u.test(file)) {
    findings.push(...checkFileSize(file, text));
  }
}

const coverage = await checkTypecheckCoverage(workspaceRoot, files);
const strictConfig = await checkStrictBaseConfig(workspaceRoot);
findings
  .filter((finding) => finding.severity === "warning")
  .forEach((finding) => {
    console.warn(
      `WARN ${finding.rule} ${relative(workspaceRoot, finding.filePath)}:${finding.line} ${finding.message}`,
    );
  });

const errors = findings.filter((finding) => finding.severity === "error");
errors.forEach((finding) => {
  console.error(
    `ERROR ${finding.rule} ${relative(workspaceRoot, finding.filePath)}:${finding.line} ${finding.message}`,
  );
});
coverage.forEach((finding) => {
  console.error(
    `ERROR typecheck-coverage ${relative(workspaceRoot, finding.packageRoot)} ${finding.message}`,
  );
});
strictConfig.forEach((message) => console.error(`ERROR strict-config ${message}`));

if (errors.length > 0 || coverage.length > 0 || strictConfig.length > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `Quality guardrails passed: ${sourceFiles.length} source/config files, ${files.length} repository files.`,
  );
}
