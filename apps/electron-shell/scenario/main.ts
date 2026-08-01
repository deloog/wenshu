import { runEditChain } from "./chain-edit.ts";
import { runPersistChain } from "./chain-persist.ts";
import { runImportScenario } from "./import.ts";
import { runRecoverScenario } from "./recover.ts";
import { runSaveLoopScenario } from "./save-loop.ts";
import { ChainFailed, reportAll, reportSummary, type ChainResult } from "./report.ts";

function overall(results: readonly ChainResult[]): "pass" | "fail" {
  return results.every((result) => result.status === "pass") ? "pass" : "fail";
}

async function runE2EScenario(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const bulkMiB = Number(params.get("bulkMaterialMiB") ?? "0");
  const bulkMaterialBytes =
    Number.isFinite(bulkMiB) && bulkMiB > 0 ? Math.floor(bulkMiB * 1024 * 1024) : 0;
  const results: ChainResult[] = [];
  let savedDocument: Record<string, unknown> = {};
  let knowledgePackage: Record<string, unknown> = {};
  try {
    const edit = await runEditChain();
    results.push(...edit.results);
    const persist = await runPersistChain(edit.finalDocument, edit.audits, {
      bulkMaterialBytes,
    });
    results.push(...persist.results);
    savedDocument = {
      fileName: "document.json",
      sha256: persist.savedDocumentSha256,
    };
    knowledgePackage = {
      fileName: "knowledge-package.zip",
      sha256: persist.knowledgePackageSha256,
      manifestSummary: persist.manifestSummary,
    };
  } catch (error) {
    if (!(error instanceof ChainFailed)) throw error;
  }
  await reportAll(results);
  await reportSummary({
    mode: "e2e",
    status: overall(results),
    chains: results,
    savedDocument,
    knowledgePackage,
  });
}

async function main(): Promise<void> {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "e2e") {
    await runE2EScenario();
    return;
  }
  if (mode === "recover") {
    await runRecoverScenario();
    return;
  }
  if (mode === "save-loop") {
    await runSaveLoopScenario();
    return;
  }
  if (mode === "import") {
    await runImportScenario();
    return;
  }
  await reportSummary({
    mode: mode ?? "missing",
    status: "fail",
    chains: [
      {
        id: "scenario-mode",
        status: "fail",
        detail: `unknown scenario mode: ${mode ?? "(missing)"}`,
      },
    ],
  });
}

main().catch((error: unknown) => {
  const detail =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  reportSummary({
    mode: "fatal",
    status: "fail",
    chains: [{ id: "scenario-fatal", status: "fail", detail }],
  }).catch(() => {
    // The report channel itself is broken; nothing more the renderer can do.
  });
});
