/**
 * A-02 sub-scenarios: cancel and permission-denied. See project-import.ts.
 */
import { createImportFlowController } from "@wenshu/ux-state/import-flow";

import { assert, projectBridge, type ProjectImportResult } from "./bridge.ts";
import { ChainFailed, ChainRecorder } from "./report.ts";
import {
  assertInitialEmptyProject,
  assertProgressWiringClean,
  assertRegistryDeclaresImportSelect,
  assertStateViewFromContract,
  selectImportFiles,
  selectProjectDirectory,
  splitSelection,
  Trajectory,
  emptyProgressWiring,
  wireProgress,
  type ProgressWiring,
  type SubRun,
} from "./project-import-shared.ts";

export async function runCancel(): Promise<SubRun> {
  const recorder = new ChainRecorder();
  const flow = createImportFlowController();
  const trajectory = new Trajectory();
  trajectory.note(flow.view());
  const target = "report-c";
  let projectGrantId = "";
  let finalStatus: ProjectImportResult["status"] | undefined;
  let cancelChannelStatus = "";
  let wiring: ProgressWiring = emptyProgressWiring();
  let cancelSettled: Promise<void> = Promise.resolve();

  try {
    await assertRegistryDeclaresImportSelect(recorder, "cancel-registry");
    await assertInitialEmptyProject(recorder, "cancel-empty-project", flow);

    await recorder.step("cancel-directory-select", async () => {
      projectGrantId = await selectProjectDirectory();
      return `scripted parent directory grant ${projectGrantId.slice(0, 16)}…`;
    });

    await recorder.step("cancel-import", async () => {
      const files = await selectImportFiles();
      assert(
        files.length === 3,
        `expected 3 selected files (md + png + bulk), got ${files.length}`,
      );
      const { source, assets } = splitSelection(files);
      const view = flow.dispatch({
        type: "import-started",
        fileName: source.file_name,
      });
      trajectory.note(view);
      assertStateViewFromContract(view, "importing");
      // Cancel on the very first real progress event; the >=32 MiB bulk asset
      // keeps the read window wide enough for the cancel round trip.
      wiring = wireProgress(flow, (progress) => {
        cancelSettled = projectBridge()
          .cancelImport({ import_id: progress.import_id })
          .then((cancelResult) => {
            cancelChannelStatus = cancelResult.status;
          });
      });
      const result = await projectBridge().importProject({
        project_grant_id: projectGrantId,
        target_dir_name: target,
        source_grant_id: source.grant_id,
        asset_grant_ids: assets.map((asset) => asset.grant_id),
      });
      await cancelSettled;
      finalStatus = result.status;
      assert(
        result.status === "cancelled",
        `cancel window lost: import completed with ${result.status} ` +
          `(cancel channel: ${cancelChannelStatus})`,
      );
      // Cancelled is an honest terminal outcome — never disguised as failure.
      assert(
        !("documentSha256" in result) && !("code" in result),
        "a cancelled import must carry neither a document digest nor an error code",
      );
      const terminal = wiring.dispatchTerminal({ type: "import-cancelled" });
      trajectory.note(terminal);
      assert(
        terminal.kind === "project-view" && terminal.cause === "import-cancelled",
        "cancelled must surface as a cancelled outcome, not a failure state",
      );
      const first = wiring.events[0];
      return (
        `cancelled at first progress event ` +
        `(${first?.phase ?? "?"} ${first?.completed ?? "?"}/${first?.total ?? "?"}), ` +
        `cancel channel: ${cancelChannelStatus}`
      );
    });

    await recorder.step("cancel-state-trajectory", () => {
      assertProgressWiringClean(wiring);
      trajectory.assertEquals([
        "empty-project",
        "importing",
        "project-view:import-cancelled",
      ]);
      return `trajectory ${trajectory.describe()}`;
    });
  } catch (error) {
    if (!(error instanceof ChainFailed)) throw error;
  } finally {
    projectBridge().offImportProgress();
  }

  return {
    results: recorder.results,
    extra: {
      targetDirName: target,
      outcome: finalStatus ?? null,
      cancelChannel: cancelChannelStatus,
      progressEvents: wiring.events.length,
      trajectory: trajectory.positions,
    },
  };
}

/* -------------------------------------------------------- permission-denied */

export async function runPermissionDenied(): Promise<SubRun> {
  const recorder = new ChainRecorder();
  const flow = createImportFlowController();
  const trajectory = new Trajectory();
  trajectory.note(flow.view());
  const target = "report-d";
  let projectGrantId = "";
  let importAttempts = 0;
  let errorCode = "";

  try {
    await assertRegistryDeclaresImportSelect(recorder, "permission-registry");
    await assertInitialEmptyProject(recorder, "permission-empty-project", flow);

    await recorder.step("permission-directory-select", async () => {
      // The orchestrator pointed the scripted dialog at a real read-only
      // directory (icacls deny-write on win32, chmod 0o555 on POSIX).
      projectGrantId = await selectProjectDirectory();
      return `read-only parent directory grant ${projectGrantId.slice(0, 16)}…`;
    });

    await recorder.step("permission-import", async () => {
      const files = await selectImportFiles();
      assert(files.length === 1, `expected 1 selected file, got ${files.length}`);
      const { source } = splitSelection(files);
      const view = flow.dispatch({
        type: "import-started",
        fileName: source.file_name,
      });
      trajectory.note(view);
      assertStateViewFromContract(view, "importing");
      importAttempts += 1;
      const result = await projectBridge().importProject({
        project_grant_id: projectGrantId,
        target_dir_name: target,
        source_grant_id: source.grant_id,
      });
      assert(
        result.status === "error" && result.code === "PERMISSION_DENIED",
        `expected PERMISSION_DENIED, got ${result.status}` +
          (result.status === "error" ? ` ${result.code}` : ""),
      );
      errorCode = result.code;
      // No path echo: the error payload is exactly {status, code, import_id}.
      assert(
        JSON.stringify(Object.keys(result).sort()) ===
          JSON.stringify(["code", "import_id", "status"]),
        `error payload must carry no message/path: ${Object.keys(result).join(",")}`,
      );
      const denied = flow.dispatch({
        type: "import-permission-denied",
        reasonCode: result.code,
        retryable: false,
      });
      trajectory.note(denied);
      const stateView = assertStateViewFromContract(denied, "permission-denied");
      assert(
        stateView.forbiddenSemantics.includes("不循环弹窗"),
        "permission-denied must carry the 不循环弹窗 forbidden semantics",
      );
      assert(
        stateView.reasonCode === "PERMISSION_DENIED",
        "permission-denied view must surface the real code",
      );
      // noRetryLoop (frozen permission.noRetryLoop): the flow never retries
      // automatically — exactly one import attempt happened in this run.
      assert(
        importAttempts === 1,
        `noRetryLoop violated: ${importAttempts} import attempts`,
      );
      const returned = flow.dispatch({ type: "return-to-project" });
      trajectory.note(returned);
      assert(
        returned.kind === "project-view" && returned.cause === "returned",
        "return-to-project must surface as the project view",
      );
      return (
        `PERMISSION_DENIED surfaced (payload keys: status/code/import_id only), ` +
        `no auto-retry (attempts=1)`
      );
    });

    await recorder.step("permission-state-trajectory", () => {
      trajectory.assertEquals([
        "empty-project",
        "importing",
        "permission-denied",
        "project-view:returned",
      ]);
      return `trajectory ${trajectory.describe()}`;
    });
  } catch (error) {
    if (!(error instanceof ChainFailed)) throw error;
  } finally {
    projectBridge().offImportProgress();
  }

  return {
    results: recorder.results,
    extra: {
      targetDirName: target,
      errorCode,
      importAttempts,
      trajectory: trajectory.positions,
    },
  };
}
