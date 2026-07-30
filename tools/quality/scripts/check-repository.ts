import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverWorkspaceFiles } from "@wenshu/test-support";

import {
  checkFileSize,
  checkForbiddenSyntax,
  checkLayering,
  checkPhantomDependencies,
  checkRoadmapInvariants,
  checkUnusedProductionDependencies,
  checkStrictBaseConfig,
  checkTypecheckCoverage,
  CODE_EXTENSIONS,
  formatLayeringCoverage,
  formatRoadmapCounts,
  hasExactExtension,
  hasNoncanonicalCodeExtension,
  inspectGeneratedFileRegistry,
  TYPESCRIPT_EXTENSIONS,
  type QualityFinding,
} from "../src/index.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const files = await discoverWorkspaceFiles(workspaceRoot);
const sourceFiles = files.filter((file) => hasExactExtension(file, CODE_EXTENSIONS));
const findings: QualityFinding[] = [];
const generatedRegistry = await inspectGeneratedFileRegistry(workspaceRoot, files);

for (const file of files.filter(hasNoncanonicalCodeExtension)) {
  findings.push({
    rule: "noncanonical-code-extension",
    severity: "error",
    filePath: file,
    line: 1,
    message: "code extension must use canonical lowercase spelling",
  });
}

for (const file of sourceFiles) {
  const text = await readFile(file, "utf8");
  findings.push(...checkForbiddenSyntax(file, text));
  if (hasExactExtension(file, TYPESCRIPT_EXTENSIONS)) {
    findings.push(...checkFileSize(file, text, generatedRegistry.generatedFiles));
  }
}

const coverage = await checkTypecheckCoverage(workspaceRoot, files);
const strictConfig = await checkStrictBaseConfig(workspaceRoot);
const phantomDependencies = await checkPhantomDependencies(workspaceRoot, files);
const unusedProductionDependencies = await checkUnusedProductionDependencies(
  workspaceRoot,
  files,
);
const layering = await checkLayering(workspaceRoot, files);
const roadmap = await checkRoadmapInvariants(
  resolve(workspaceRoot, "docs/implementation-roadmap.md"),
);
console.log(formatRoadmapCounts(roadmap));
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
phantomDependencies.forEach((finding) => {
  console.error(
    `ERROR phantom-dependency ${relative(workspaceRoot, finding.filePath)} ${finding.message}`,
  );
});
unusedProductionDependencies.forEach((finding) => {
  console.error(
    `ERROR unused-production-dependency ${relative(workspaceRoot, finding.filePath)} ${finding.message}`,
  );
});
layering.findings.forEach((finding) => {
  console.error(
    `ERROR layering ${relative(workspaceRoot, finding.filePath)}:${finding.line} ${finding.message}`,
  );
});
generatedRegistry.findings.forEach((finding) => {
  console.error(
    `ERROR generated-registry ${relative(workspaceRoot, finding.packageRoot)} ${finding.message}`,
  );
});
roadmap.findings.forEach((finding) => {
  console.error(
    `ERROR ${finding.rule} ${relative(workspaceRoot, finding.filePath)}:${finding.line} ${finding.message}`,
  );
});

if (
  errors.length > 0 ||
  coverage.length > 0 ||
  strictConfig.length > 0 ||
  phantomDependencies.length > 0 ||
  unusedProductionDependencies.length > 0 ||
  layering.findings.length > 0 ||
  generatedRegistry.findings.length > 0
) {
  process.exitCode = 1;
} else {
  console.log(formatLayeringCoverage(layering.coverage));
  console.log(
    `Quality guardrails passed: ${sourceFiles.length} source/config files, ${files.length} repository files.`,
  );
}
