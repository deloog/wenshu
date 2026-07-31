/**
 * Regression guard for G2-04 exit-code wiring (PB-10 MAJOR-5).
 * A roadmap invariant violation must cause check-repository to exit non-zero.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkRepository } from "../src/check-repository.ts";

import { makeMirror, replaceOnce } from "./roadmap-mirror.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("roadmap findings cause check-repository to exit non-zero", async () => {
  const mirror = await makeMirror((text) =>
    replaceOnce(
      text,
      "audits/PB-10-claude-audit-report.md",
      "audits/NONEXISTENT-report.md",
    ),
  );
  try {
    const result = await checkRepository({
      workspaceRoot,
      roadmapPath: mirror.roadmapPath,
    });
    assert.notEqual(
      result.exitCode,
      0,
      `expected non-zero exit, roadmapFindings=${JSON.stringify(result.roadmapFindings)}`,
    );
    assert.ok(
      result.roadmapFindings.some((finding) =>
        /roadmap-ledger-(missing-report-link|broken-link)/u.test(finding.rule),
      ),
      "expected a roadmap ledger finding in output",
    );
  } finally {
    await mirror.cleanup();
  }
});
