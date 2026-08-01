import { assert } from "./bridge.ts";
import { ChainRecorder, reportAll, reportSummary, type ChainResult } from "./report.ts";

/**
 * Recover-mode scenario (`?mode=recover`). The main process has already run
 * recoverGrantDirectory (dual prefix) + openProjectStore({recover:true}) and
 * written the ready marker; the actual artifact hash it computed from the
 * real file system arrives via query params. The renderer reconciles it
 * against the expected hash (from the pre-kill e2e run) and reports.
 */
export async function runRecoverScenario(): Promise<void> {
  const recorder = new ChainRecorder();
  const params = new URLSearchParams(window.location.search);
  const actual = params.get("docSha256") ?? "";
  const expected = params.get("expected") ?? "";
  const removedResidue = params.get("removedResidue") ?? "";
  const recoverySource = params.get("recoverySource") ?? "";

  await recorder.step("recover-artifact-read", () => {
    assert(
      /^[0-9a-f]{64}$/u.test(actual),
      `saved document.json digest missing or malformed: ${actual}`,
    );
    assert(/^[0-9]+$/u.test(removedResidue), "removedResidue missing");
    return `document.json read back, sha256 ${actual.slice(0, 16)}…, residue removed=${removedResidue}`;
  });

  await recorder.step("recover-hash-reconcile", () => {
    assert(
      /^[0-9a-f]{64}$/u.test(expected),
      "expected digest not provided (E2E_EXPECTED_DOC_SHA256); fail-closed",
    );
    assert(
      actual === expected,
      `recovered document digest ${actual.slice(0, 16)}… != expected ${expected.slice(0, 16)}…`,
    );
    return "recovered document byte-identical to the pre-kill saved version";
  });

  const results: readonly ChainResult[] = recorder.results;
  await reportAll(results);
  await reportSummary({
    mode: "recover",
    status: results.every((result) => result.status === "pass") ? "pass" : "fail",
    chains: results,
    recoveredDocument: {
      fileName: "document.json",
      actual_sha256: actual,
      expected_sha256: expected,
      match: actual === expected,
    },
    recovery: {
      removedResidue: Number(removedResidue),
      recoverySource: recoverySource === "" ? null : recoverySource,
    },
  });
}
