/**
 * A-02 sub-scenarios: happy+open and partial. See project-import.ts.
 */
import { createImportFlowController } from "@wenshu/ux-state/import-flow";

import { assert, projectBridge } from "./bridge.ts";
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
  wireProgress,
  type ImportOutcome,
  type ProgressWiring,
  type SubRun,
} from "./project-import-shared.ts";

export async function runHappy(): Promise<SubRun> {
  const recorder = new ChainRecorder();
  const flow = createImportFlowController();
  const trajectory = new Trajectory();
  trajectory.note(flow.view());
  const target = "report-a";
  const importTarget = "report-b";
  let projectGrantId = "";
  let outcome: ImportOutcome | undefined;
  let wiring: ProgressWiring = { events: [], dispatchErrors: [] };

  try {
    await assertRegistryDeclaresImportSelect(recorder, "happy-registry");
    await assertInitialEmptyProject(recorder, "happy-empty-project", flow);

    await recorder.step("happy-directory-select", async () => {
      projectGrantId = await selectProjectDirectory();
      return `scripted parent directory grant ${projectGrantId.slice(0, 16)}…`;
    });

    await recorder.step("happy-project-new", async () => {
      const created = await projectBridge().newProject({
        grant_id: projectGrantId,
        dir_name: target,
      });
      assert(created.status === "created", `project.new: ${created.status}`);
      return `project directory ${target} created (empty-project convention)`;
    });

    await recorder.step("happy-file-import-select", async () => {
      const files = await selectImportFiles();
      assert(
        files.length === 3,
        `expected 3 selected files (md + 2 png), got ${files.length}`,
      );
      const { source, assets } = splitSelection(files);
      assert(assets.length === 2, `expected 2 asset grants, got ${assets.length}`);
      const view = flow.dispatch({
        type: "import-started",
        fileName: source.file_name,
      });
      trajectory.note(view);
      const importing = assertStateViewFromContract(view, "importing");
      assert(importing.cancelable === true, "importing must be cancelable");
      assert(
        importing.fileName === source.file_name,
        "importing view must carry the display file name",
      );
      wiring = wireProgress(flow);
      const result = await projectBridge().importProject({
        project_grant_id: projectGrantId,
        // D2: the import target must not exist beforehand — the freshly
        // created empty project report-a is NOT merged into; the import
        // lands in its own sibling directory report-b.
        target_dir_name: importTarget,
        source_grant_id: source.grant_id,
        asset_grant_ids: assets.map((asset) => asset.grant_id),
      });
      assert(
        result.status === "success",
        `importProject: ${result.status}` +
          (result.status === "error" ? ` ${result.code}` : ""),
      );
      assert(/^[0-9a-f]{64}$/u.test(result.documentSha256), "documentSha256 malformed");
      assert(
        result.importedAssets.length === 2,
        `expected 2 imported assets, got ${result.importedAssets.length}`,
      );
      assert(
        result.failedAssets.length === 0,
        `expected 0 failed assets, got ${result.failedAssets.length}`,
      );
      for (const asset of result.importedAssets) {
        assert(
          asset.path.startsWith("assets/"),
          `asset path outside assets/: ${asset.path}`,
        );
      }
      outcome = result;
      const terminal = flow.dispatch({ type: "import-succeeded" });
      trajectory.note(terminal);
      assert(
        terminal.kind === "project-view" && terminal.cause === "import-succeeded",
        "import success must surface as the project view, not a machine state",
      );
      return (
        `import success: document ${result.documentSha256.slice(0, 16)}…, ` +
        `material=${result.materialName}, assets=2, failed=0`
      );
    });

    await recorder.step("happy-project-open", async () => {
      assert(outcome !== undefined, "import outcome missing");
      // Second queued directory selection: the imported project directory.
      const openGrantId = await selectProjectDirectory();
      const opened = await projectBridge().openProject({ grant_id: openGrantId });
      assert(opened.status === "opened", `project.open: ${opened.status}`);
      assert(opened.has_document === true, "opened project must have a document");
      assert(
        opened.document_sha256 === outcome.documentSha256,
        `open sha256 ${opened.document_sha256.slice(0, 16)}… != import ` +
          `${outcome.documentSha256.slice(0, 16)}…`,
      );
      assert(
        opened.title === "E2E 导入报告",
        `unexpected document title: ${String(opened.title)}`,
      );
      const view = flow.dispatch({
        type: "project-opened",
        projectName: importTarget,
      });
      trajectory.note(view);
      assert(
        view.kind === "project-view" && view.cause === "project-opened",
        "project-opened must surface as the project view",
      );
      return `reopened ${importTarget}: document sha256 reconciled, title verbatim`;
    });

    await recorder.step("happy-state-trajectory", () => {
      assertProgressWiringClean(wiring);
      trajectory.assertEquals([
        "empty-project",
        "importing",
        "project-view:import-succeeded",
        "project-view:project-opened",
      ]);
      return `trajectory ${trajectory.describe()} (${wiring.events.length} progress events)`;
    });
  } catch (error) {
    if (!(error instanceof ChainFailed)) throw error;
  } finally {
    projectBridge().offImportProgress();
  }

  return {
    results: recorder.results,
    extra: {
      targetDirName: importTarget,
      emptyProjectDirName: target,
      documentSha256: outcome?.documentSha256 ?? null,
      materialName: outcome?.materialName ?? null,
      importedAssets: outcome?.importedAssets ?? [],
      failedAssets: outcome?.failedAssets ?? [],
      progressEvents: wiring.events.length,
      trajectory: trajectory.positions,
    },
  };
}

/* ---------------------------------------------------------------- partial */

export async function runPartial(): Promise<SubRun> {
  const recorder = new ChainRecorder();
  const flow = createImportFlowController();
  const trajectory = new Trajectory();
  trajectory.note(flow.view());
  const target = "report-p";
  let projectGrantId = "";
  let outcome: ImportOutcome | undefined;
  let wiring: ProgressWiring = { events: [], dispatchErrors: [] };

  try {
    await assertRegistryDeclaresImportSelect(recorder, "partial-registry");
    await assertInitialEmptyProject(recorder, "partial-empty-project", flow);

    await recorder.step("partial-directory-select", async () => {
      projectGrantId = await selectProjectDirectory();
      return `scripted parent directory grant ${projectGrantId.slice(0, 16)}…`;
    });

    await recorder.step("partial-import", async () => {
      // The orchestrator scripted only report.md + img1.png; the markdown
      // references img2.png as well, which was never selected (R-3: the host
      // must not widen the grant to "helpfully" read it from the same dir).
      const files = await selectImportFiles();
      assert(
        files.length === 2,
        `expected 2 selected files (md + 1 png), got ${files.length}`,
      );
      const { source, assets } = splitSelection(files);
      const view = flow.dispatch({
        type: "import-started",
        fileName: source.file_name,
      });
      trajectory.note(view);
      assertStateViewFromContract(view, "importing");
      wiring = wireProgress(flow);
      const result = await projectBridge().importProject({
        project_grant_id: projectGrantId,
        target_dir_name: target,
        source_grant_id: source.grant_id,
        asset_grant_ids: assets.map((asset) => asset.grant_id),
      });
      assert(
        result.status === "partial",
        `importProject: ${result.status}` +
          (result.status === "error" ? ` ${result.code}` : ""),
      );
      assert(
        result.failedAssets.length === 1,
        `expected exactly 1 failed asset, got ${result.failedAssets.length}`,
      );
      const failed = result.failedAssets[0];
      assert(failed !== undefined, "failed asset entry missing");
      assert(
        failed.fileName === "img2.png" &&
          failed.reasonCode === "asset_not_provided" &&
          failed.retryable === true,
        `unexpected failed asset entry: ${JSON.stringify(failed)}`,
      );
      assert(
        result.importedAssets.length === 1,
        `expected 1 imported asset, got ${result.importedAssets.length}`,
      );
      outcome = result;
      const partialView = flow.dispatch({
        type: "import-partial",
        items: result.failedAssets,
      });
      trajectory.note(partialView);
      const stateView = assertStateViewFromContract(partialView, "import-partial");
      // forbiddenSemantics "不整体吞掉结果" is really satisfied: every failed
      // asset is enumerated per item, with reason and retryable flag.
      assert(
        stateView.forbiddenSemantics.includes("不整体吞掉结果"),
        "import-partial must carry the 不整体吞掉结果 forbidden semantics",
      );
      assert(
        stateView.items !== undefined &&
          stateView.items.length === 1 &&
          stateView.items[0]?.fileName === failed.fileName &&
          stateView.items[0]?.reasonCode === failed.reasonCode &&
          stateView.items[0]?.retryable === true,
        "import-partial view must enumerate the failure item-wise",
      );
      const returned = flow.dispatch({ type: "return-to-project" });
      trajectory.note(returned);
      assert(
        returned.kind === "project-view" && returned.cause === "returned",
        "return-to-project must surface as the project view",
      );
      return (
        `partial import: 1 imported asset, failed=[${failed.fileName}: ` +
        `${failed.reasonCode}, retryable]`
      );
    });

    await recorder.step("partial-state-trajectory", () => {
      assertProgressWiringClean(wiring);
      trajectory.assertEquals([
        "empty-project",
        "importing",
        "import-partial",
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
      documentSha256: outcome?.documentSha256 ?? null,
      materialName: outcome?.materialName ?? null,
      importedAssets: outcome?.importedAssets ?? [],
      failedAssets: outcome?.failedAssets ?? [],
      trajectory: trajectory.positions,
    },
  };
}
