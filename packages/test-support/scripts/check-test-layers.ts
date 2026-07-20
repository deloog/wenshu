import { fileURLToPath } from "node:url";

import {
  acceptedTestSuffixes,
  classifyTestFile,
  discoverTestFiles,
  displayTestPath,
} from "../src/index.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const files = await discoverTestFiles(workspaceRoot);
const invalid = files.filter((file) => classifyTestFile(file) === undefined);

if (invalid.length > 0) {
  console.error("Test files without an explicit layer:");
  invalid.forEach((file) => console.error(`- ${displayTestPath(workspaceRoot, file)}`));
  console.error(`Accepted suffixes: ${acceptedTestSuffixes().join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Test layer audit passed: ${files.length} files classified.`);
}
