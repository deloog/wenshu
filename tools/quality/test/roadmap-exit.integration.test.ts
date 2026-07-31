/**
 * Regression guard for G2-04 exit-code wiring (PB-10 MAJOR-5).
 * A roadmap invariant violation must cause check-repository to exit non-zero.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { makeMirror, replaceOnce } from "./roadmap-mirror.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const scriptPath = fileURLToPath(
  new URL("../scripts/check-repository.ts", import.meta.url),
);

test("roadmap findings cause check-repository to exit non-zero", async () => {
  const mirror = await makeMirror((text) =>
    replaceOnce(
      text,
      "audits/PB-10-claude-audit-report.md",
      "audits/NONEXISTENT-report.md",
    ),
  );
  try {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", scriptPath],
      {
        cwd: workspaceRoot,
        env: { ...process.env, ROADMAP_PATH: mirror.roadmapPath },
        encoding: "utf8",
      },
    );
    assert.notEqual(
      result.status,
      0,
      `expected non-zero exit, got stdout=${result.stdout} stderr=${result.stderr}`,
    );
    const combined = `${result.stdout}\n${result.stderr}`;
    assert.match(
      combined,
      /roadmap-ledger-(missing-report-link|broken-link)/u,
      "expected a roadmap ledger finding in output",
    );
  } finally {
    await mirror.cleanup();
  }
});
