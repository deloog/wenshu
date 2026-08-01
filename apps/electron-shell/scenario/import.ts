import { assert, e2eBridge, type KnowledgeImportResult } from "./bridge.ts";
import {
  ChainFailed,
  ChainRecorder,
  reportAll,
  reportSummary,
  type ChainResult,
} from "./report.ts";

/**
 * Import scenario (`?mode=import&source=<flatName>&target=<flatName>&expected=<sha256>`),
 * PB-12 W3 chains 5 and 7. Re-imports a real on-disk knowledge package from
 * the grant workdir through the main-process orchestration channel. A
 * rejection (e.g. a tampered package) is recorded as a failing chain whose
 * detail carries the real KnowledgePackageError code, then a fail summary
 * (exit 1). Chain 5 never reaches the summary: the orchestrator SIGKILLs
 * mid-import while the marker file exists.
 */

const FLAT_NAME = /^(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export async function runImportScenario(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("source") ?? "";
  const target = params.get("target") ?? "";
  const expected = params.get("expected") ?? "";
  const recorder = new ChainRecorder();
  let imported: KnowledgeImportResult | undefined;

  try {
    await recorder.step("knowledge-import", async () => {
      assert(FLAT_NAME.test(source), `source file name rejected: ${source}`);
      assert(FLAT_NAME.test(target), `target dir name rejected: ${target}`);
      imported = await e2eBridge().import({
        sourceFileName: source,
        targetDirName: target,
      });
      return (
        `imported ${imported.entry_count} entries, ` +
        `materials=${imported.material_count}, audits=${imported.audit_event_count}`
      );
    });

    await recorder.step("knowledge-import-hash", () => {
      assert(imported !== undefined, "import result missing");
      if (expected !== "") {
        assert(
          imported.document_sha256 === expected,
          `imported document sha256 ${imported.document_sha256.slice(0, 16)}… ` +
            `!= expected ${expected.slice(0, 16)}…`,
        );
      }
      return `document sha256 ${imported.document_sha256.slice(0, 16)}… reconciled`;
    });
  } catch (error) {
    if (!(error instanceof ChainFailed)) throw error;
  }

  const results: readonly ChainResult[] = recorder.results;
  await reportAll(results);
  await reportSummary({
    mode: "import",
    status: results.every((result) => result.status === "pass") ? "pass" : "fail",
    chains: results,
    imported: imported ?? null,
  });
}
