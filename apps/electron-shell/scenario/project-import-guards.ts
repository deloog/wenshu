/**
 * A-02 sub-scenarios: target-exists (D2) and handle-reuse (R-2). See
 * project-import.ts.
 */
import { createImportFlowController } from "@wenshu/ux-state/import-flow";

import { assert, projectBridge } from "./bridge.ts";
import { ChainFailed, ChainRecorder } from "./report.ts";
import {
  assertInitialEmptyProject,
  assertRegistryDeclaresImportSelect,
  assertStateViewFromContract,
  selectImportFiles,
  selectProjectDirectory,
  splitSelection,
  Trajectory,
  wiringHelper,
  type ImportOutcome,
  type SubRun,
} from "./project-import-shared.ts";

export async function runTargetExists(): Promise<SubRun> {
  const recorder = new ChainRecorder();
  const flow = createImportFlowController();
  const trajectory = new Trajectory();
  trajectory.note(flow.view());
  const target = "report-e";
  let projectGrantId = "";

  try {
    await assertRegistryDeclaresImportSelect(recorder, "exists-registry");
    await assertInitialEmptyProject(recorder, "exists-empty-project", flow);

    await recorder.step("exists-directory-select", async () => {
      projectGrantId = await selectProjectDirectory();
      return `scripted parent directory grant ${projectGrantId.slice(0, 16)}…`;
    });

    await recorder.step("exists-project-new-twice", async () => {
      const first = await projectBridge().newProject({
        grant_id: projectGrantId,
        dir_name: target,
      });
      assert(first.status === "created", `first project.new: ${first.status}`);
      const second = await projectBridge().newProject({
        grant_id: projectGrantId,
        dir_name: target,
      });
      // D2: refuse; never merge, never silently rename.
      assert(
        second.status === "exists",
        `second project.new: ${second.status} (must be "exists")`,
      );
      assert(
        JSON.stringify(Object.keys(second)) === JSON.stringify(["status"]),
        `"exists" must not carry a mutated dir_name: ${JSON.stringify(second)}`,
      );
      return `second project.new refused with "exists" (no merge, no rename)`;
    });

    await recorder.step("exists-import-conflict", async () => {
      const files = await selectImportFiles();
      assert(files.length === 1, `expected 1 selected file, got ${files.length}`);
      const { source } = splitSelection(files);
      const view = flow.dispatch({
        type: "import-started",
        fileName: source.file_name,
      });
      trajectory.note(view);
      assertStateViewFromContract(view, "importing");
      const result = await projectBridge().importProject({
        project_grant_id: projectGrantId,
        target_dir_name: target,
        source_grant_id: source.grant_id,
      });
      assert(
        result.status === "error" && result.code === "CONFLICT",
        `expected CONFLICT, got ${result.status}` +
          (result.status === "error" ? ` ${result.code}` : ""),
      );
      assert(
        JSON.stringify(Object.keys(result).sort()) ===
          JSON.stringify(["code", "import_id", "status"]),
        `error payload must carry no message/path: ${Object.keys(result).join(",")}`,
      );
      const failed = flow.dispatch({ type: "import-failed", reasonCode: result.code });
      trajectory.note(failed);
      assert(
        failed.kind === "project-view" &&
          failed.cause === "import-failed" &&
          failed.reasonCode === "CONFLICT",
        "the real CONFLICT code must be surfaced, not disguised",
      );
      return `import into existing ${target} refused with CONFLICT (D2)`;
    });

    await recorder.step("exists-state-trajectory", () => {
      trajectory.assertEquals([
        "empty-project",
        "importing",
        "project-view:import-failed",
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
    extra: { targetDirName: target, trajectory: trajectory.positions },
  };
}

/* ------------------------------------------------------------- handle-reuse */

export async function runHandleReuse(): Promise<SubRun> {
  const recorder = new ChainRecorder();
  const flow = createImportFlowController();
  const trajectory = new Trajectory();
  trajectory.note(flow.view());
  const target = "report-f";
  const secondTarget = "report-f2";
  let projectGrantId = "";
  let outcome: ImportOutcome | undefined;
  let sourceGrantId = "";
  let sourceFileName = "";

  try {
    await assertRegistryDeclaresImportSelect(recorder, "reuse-registry");
    await assertInitialEmptyProject(recorder, "reuse-empty-project", flow);

    await recorder.step("reuse-directory-select", async () => {
      projectGrantId = await selectProjectDirectory();
      return `scripted parent directory grant ${projectGrantId.slice(0, 16)}…`;
    });

    await recorder.step("reuse-file-import-select", async () => {
      const files = await selectImportFiles();
      assert(files.length === 1, `expected 1 selected file, got ${files.length}`);
      const { source } = splitSelection(files);
      sourceGrantId = source.grant_id;
      sourceFileName = source.file_name;
      return `one single-file grant for ${source.file_name} (selected exactly once)`;
    });

    await recorder.step("reuse-first-import", async () => {
      const view = flow.dispatch({ type: "import-started", fileName: sourceFileName });
      trajectory.note(view);
      assertStateViewFromContract(view, "importing");
      wiringHelper(flow);
      const result = await projectBridge().importProject({
        project_grant_id: projectGrantId,
        target_dir_name: target,
        source_grant_id: sourceGrantId,
      });
      projectBridge().offImportProgress();
      assert(
        result.status === "success",
        `first importProject: ${result.status}` +
          (result.status === "error" ? ` ${result.code}` : ""),
      );
      outcome = result;
      const terminal = flow.dispatch({ type: "import-succeeded" });
      trajectory.note(terminal);
      return `first import consumed the handle (document ${result.documentSha256.slice(0, 16)}…)`;
    });

    await recorder.step("reuse-second-import", async () => {
      // R-2 E2E 反例: the SAME source handle a second time. The handle was
      // consumed by the first import (consume-on-read); reuse must fail
      // closed with NOT_FOUND.
      const view = flow.dispatch({ type: "import-started", fileName: sourceFileName });
      trajectory.note(view);
      assertStateViewFromContract(view, "importing");
      const result = await projectBridge().importProject({
        project_grant_id: projectGrantId,
        target_dir_name: secondTarget,
        source_grant_id: sourceGrantId,
      });
      assert(
        result.status === "error" && result.code === "NOT_FOUND",
        `handle reuse must fail closed NOT_FOUND, got ${result.status}` +
          (result.status === "error" ? ` ${result.code}` : ""),
      );
      const failed = flow.dispatch({ type: "import-failed", reasonCode: result.code });
      trajectory.note(failed);
      assert(
        failed.kind === "project-view" &&
          failed.cause === "import-failed" &&
          failed.reasonCode === "NOT_FOUND",
        "the real NOT_FOUND code must be surfaced, not disguised",
      );
      return `reused source handle refused with NOT_FOUND (R-2 consume-on-read)`;
    });

    await recorder.step("reuse-state-trajectory", () => {
      trajectory.assertEquals([
        "empty-project",
        "importing",
        "project-view:import-succeeded",
        "importing",
        "project-view:import-failed",
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
      secondTargetDirName: secondTarget,
      documentSha256: outcome?.documentSha256 ?? null,
      materialName: outcome?.materialName ?? null,
      importedAssets: outcome?.importedAssets ?? [],
      trajectory: trajectory.positions,
    },
  };
}
