import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  discoverLayerTests,
  displayTestPath,
  isTestLayer,
} from "../src/index.ts";

const requestedLayer = process.argv[2];
const allowEmpty = process.argv.includes("--allow-empty");
if (requestedLayer === undefined || !isTestLayer(requestedLayer)) {
  console.error(
    "Usage: run-test-layer.ts <unit|contract|render|integration|e2e> [--allow-empty]",
  );
  process.exitCode = 2;
} else {
  const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const files = await discoverLayerTests(workspaceRoot, requestedLayer);
  if (files.length === 0) {
    console.log(
      JSON.stringify({
        layer: requestedLayer,
        status: "not-registered",
        test_count: 0,
        allow_empty: allowEmpty,
      }),
    );
    if (!allowEmpty) {
      process.exitCode = 3;
    }
  } else {
    console.log(
      `${requestedLayer}: ${files.length} registered test file(s)\n${files
        .map((file) => `- ${displayTestPath(workspaceRoot, file)}`)
        .join("\n")}`,
    );
    const result = spawnSync(process.execPath, ["--test", ...files], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    process.exitCode = result.status ?? 1;
  }
}
