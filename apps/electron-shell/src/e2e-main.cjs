/**
 * PB-12 W2: E2E-only Electron entry point. Enabled only with `--e2e`
 * (`--e2e --recover` selects recovery mode). It registers the same three
 * wenshu.host.* channels as main.cjs (scripted selectDirectory instead of a
 * human dialog, same contract as the file-host tests) plus three
 * orchestration channels that exist only in this mode:
 *   e2e.knowledge.export / e2e.knowledge.import / e2e.report
 * Knowledge-package export/import run main-process side because they need
 * node:crypto/fs; the sandboxed renderer never touches node: APIs. Import
 * reads the real on-disk package from the grant workdir (flat source file
 * name only), so arbitrarily large packages never cross IPC as base64.
 * main.cjs is untouched; non-e2e behavior of the product shell is unchanged.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const { Buffer } = require("node:buffer");
const { createHash } = require("node:crypto");
const { appendFile, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { dirname, isAbsolute, join, resolve } = require("node:path");
const { registerProjectChannels } = require("./project-channels.cjs");

const appDir = dirname(require.resolve("./e2e-main.cjs"));
const instanceId = "host_e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0";
const WATCHDOG_MS = 180000;

const argv = globalThis.process.argv;
if (!argv.includes("--e2e")) {
  globalThis.process.stderr.write("e2e-main.cjs requires --e2e; refusing to start\n");
  app.exit(1);
}
const recoverMode = argv.includes("--recover");

function requiredEnv(name) {
  const value = globalThis.process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`E2E_ENV_MISSING ${name}`);
  }
  return value;
}

const workdir = requiredEnv("E2E_WORKDIR");
const reportDir = requiredEnv("E2E_REPORT_DIR");
const reportPath = join(reportDir, "scenario-report.ndjson");
const readyMarkerPath = globalThis.process.env["E2E_READY_MARKER"];
const expectedDocSha256 = globalThis.process.env["E2E_EXPECTED_DOC_SHA256"] ?? "";

const preferences = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  preload: resolve(appDir, "preload.cjs"),
  additionalArguments: ["--wenshu-e2e"],
});

async function loadHostModules() {
  const [storage, contract] = await Promise.all([
    import("@wenshu/project-storage"),
    import("@wenshu/host-contract"),
  ]);
  return { storage, contract };
}

/**
 * A-02: scripted project.directory.select override. E2E_SELECT_DIRECTORY is a
 * JSON array of directory selectors (flat names relative to the workdir, or
 * absolute paths kept as-is), consumed one per call in order; the last entry
 * repeats when the queue is exhausted. Unset keeps the PB-12 behavior (every
 * call selects the workdir itself).
 */
const selectDirectoryQueue = (() => {
  const raw = globalThis.process.env["E2E_SELECT_DIRECTORY"];
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return JSON.parse(raw);
})();

function scriptedSelectDirectory() {
  let name = ".";
  if (selectDirectoryQueue !== undefined) {
    name =
      selectDirectoryQueue.length > 1
        ? selectDirectoryQueue.shift()
        : selectDirectoryQueue[0];
  }
  const root = isAbsolute(name) ? name : resolve(workdir, name);
  return Promise.resolve({
    status: "selected",
    root,
    displayName: "e2e-workdir",
  });
}

/**
 * A-02: scripted file.import.select. E2E_SELECT_FILES is a JSON array of flat
 * file names relative to the workdir (joined here) or absolute paths (kept
 * as-is); the env unset means the scripted user cancelled the dialog.
 */
function scriptedSelectFiles() {
  const raw = globalThis.process.env["E2E_SELECT_FILES"];
  if (raw === undefined || raw === "") {
    return Promise.resolve({ status: "cancelled" });
  }
  const names = JSON.parse(raw);
  const files = names.map((name) => (isAbsolute(name) ? name : join(workdir, name)));
  return Promise.resolve({ status: "selected", files });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function registerHostChannels(fileHost) {
  ipcMain.handle("wenshu.host.registry", () => fileHost.registry);
  ipcMain.handle("wenshu.host.invoke", (_event, request) => fileHost.invoke(request));
  ipcMain.handle("wenshu.host.cancel", (_event, request) => fileHost.cancel(request));
}

let watchdog;
let finished = false;

function finish(code) {
  if (finished) return;
  finished = true;
  globalThis.clearTimeout(watchdog);
  app.exit(code);
}

/**
 * A-03 (E2E_SCENARIO_MODE=workspace): after the renderer reports
 * "workspace-ready", replay E2E_KEY_SCRIPT through Chromium's trusted input
 * pipeline (sendInputEvent — the same path real keyboards take), then pull the
 * final workspace snapshot back with executeJavaScript and append it to the
 * scenario report as a "workspace-result" line. Each step is
 * { key, ctrl?, shift?, times? } where key is a DOM KeyboardEvent.key value.
 */
async function replayWorkspaceKeys(contents) {
  try {
    const script = JSON.parse(requiredEnv("E2E_KEY_SCRIPT"));
    // sendInputEvent keyCode uses Chromium's legacy names for arrows; every
    // other DOM KeyboardEvent.key value in the A-03 map passes through as-is.
    const keyCodeNames = {
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
    };
    for (const step of script) {
      const modifiers = [];
      if (step.ctrl === true) modifiers.push("control");
      if (step.shift === true) modifiers.push("shift");
      const keyCode = keyCodeNames[step.key] ?? step.key;
      const times = Number.isInteger(step.times) && step.times > 0 ? step.times : 1;
      for (let index = 0; index < times; index += 1) {
        contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
        contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
        // Let the renderer's async per-key transaction settle before the next key.
        await new Promise((resolve) => globalThis.setTimeout(resolve, 25));
      }
    }
    // Settle margin after the last key before pulling the snapshot: the
    // renderer finishes each key's transaction in microtasks, but under CI
    // load the final key's dispatch task itself may land late; this window
    // keeps the read honest without masking a real stall (watchdog bounds it).
    await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
    const result = await contents.executeJavaScript(
      "window.__wenshuWorkspaceReport()",
      true,
    );
    await appendFile(
      reportPath,
      `${JSON.stringify({ type: "workspace-result", ...result })}\n`,
    );
    finish(0);
  } catch (error) {
    globalThis.process.stderr.write(`workspace key replay failed: ${String(error)}\n`);
    finish(1);
  }
}

let workspaceWindowContents;

/** Flat file/dir names only: no separators, no traversal, no trailing dot. */
const FLAT_NAME = /^(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

function registerE2EChannels(storage) {
  ipcMain.handle("e2e.knowledge.export", async (_event, input) => {
    const { exportKnowledgePackage } = await import("@wenshu/knowledge-package");
    const materials = input.materials.map((material) => ({
      materialId: material.materialId,
      displayName: material.displayName,
      mediaType: material.mediaType,
      bytes: Buffer.from(material.bytesBase64, "base64"),
    }));
    const exported = exportKnowledgePackage({ ...input, materials });
    return {
      zipBase64: Buffer.from(exported.bytes).toString("base64"),
      sha256: sha256(exported.bytes),
      manifestSummary: {
        package_id: exported.manifest.package_id,
        entry_count: exported.manifest.entries.length,
        truth_entry_count: exported.manifest.entries.filter(
          (entry) => entry.classification === "truth",
        ).length,
        audit_event_count: exported.project.semantic_audit_event_ids.length,
      },
    };
  });

  ipcMain.handle("e2e.knowledge.import", async (_event, input) => {
    const markerPath = requiredEnv("E2E_IMPORT_MARKER");
    const targetDirName = input.targetDirName;
    const sourceFileName = input.sourceFileName;
    if (typeof targetDirName !== "string" || !FLAT_NAME.test(targetDirName)) {
      throw new Error("E2E_INVALID_TARGET_DIR");
    }
    if (typeof sourceFileName !== "string" || !FLAT_NAME.test(sourceFileName)) {
      throw new Error("E2E_INVALID_SOURCE_FILE");
    }
    // The marker lets the W3 orchestrator SIGKILL mid-import; it is removed on
    // any clean completion (success or handled failure).
    await mkdir(dirname(markerPath), { recursive: true });
    await writeFile(
      markerPath,
      `${JSON.stringify({ startedAt: new Date().toISOString(), targetDirName })}\n`,
    );
    try {
      const { importKnowledgePackage } = await import("@wenshu/knowledge-package");
      // W3: the source is the real on-disk artifact inside the grant workdir
      // (flat name joined above), read main-process side by the importer
      // itself; large packages never cross IPC as base64.
      const sourcePath = join(workdir, sourceFileName);
      const grants = storage.createGrantTable();
      const grant = grants.register(workdir, "read_write");
      const targetRoot = join(workdir, targetDirName);
      const imported = await importKnowledgePackage({ sourcePath, targetRoot, grant });
      await rm(markerPath, { force: true });
      return {
        package_id: imported.manifest.package_id,
        project_id: imported.project.project_id,
        title: imported.project.title,
        entry_count: imported.manifest.entries.length,
        audit_event_count: imported.audits.length,
        material_count: imported.project.materials.length,
        document_sha256: imported.project.document.sha256,
        target_root: targetRoot,
      };
    } catch (error) {
      await rm(markerPath, { force: true }).catch(() => undefined);
      // KnowledgePackageError.code does not appear in .message; embed it so the
      // renderer (and the W3 report) can assert the real rejection code.
      if (error instanceof Error && typeof error.code === "string") {
        throw new Error(`${error.code}: ${error.message}`, { cause: error });
      }
      throw error;
    }
  });

  ipcMain.handle("e2e.report", async (_event, payload) => {
    const line = JSON.stringify(payload);
    if (typeof line !== "string") throw new Error("E2E_REPORT_NOT_SERIALIZABLE");
    await appendFile(reportPath, `${line}\n`);
    if (payload?.type === "summary") {
      finish(payload.status === "pass" ? 0 : 1);
    } else if (
      payload?.type === "workspace-ready" &&
      workspaceWindowContents !== undefined
    ) {
      // A-03: renderer mounted the workspace; start the trusted key replay.
      void replayWorkspaceKeys(workspaceWindowContents);
    } else if (payload?.type === "workspace-error") {
      // A-03: renderer-side fail-closed (corrupt / DOCUMENT_INVALID / channel
      // error). The error line carries the evidence; exit so orchestrators
      // asserting on it are not held by the watchdog.
      finish(0);
    }
    return null;
  });
}

async function recoverArtifacts(storage) {
  const recovery = await storage.recoverGrantDirectory(workdir);
  const store = await storage.openProjectStore({
    databasePath: join(workdir, "project.sqlite"),
    backupDirectory: join(workdir, "backups"),
    recover: true,
  });
  const recoverySource = store.recoverySource;
  store.close();
  let documentSha256 = null;
  try {
    documentSha256 = sha256(await readFile(join(workdir, "document.json")));
  } catch {
    // Missing or unreadable document is reported honestly as null.
  }
  const marker = {
    recoveredAt: new Date().toISOString(),
    artifacts: { "document.json": documentSha256 },
    removedResidue: recovery.removedResidue,
    recoverySource,
  };
  if (readyMarkerPath === undefined || readyMarkerPath === "") {
    throw new Error("E2E_ENV_MISSING E2E_READY_MARKER (recover mode)");
  }
  await mkdir(dirname(readyMarkerPath), { recursive: true });
  await writeFile(readyMarkerPath, `${JSON.stringify(marker, null, 2)}\n`);
  return marker;
}

app
  .whenReady()
  .then(async () => {
    await mkdir(reportDir, { recursive: true });
    const { storage, contract } = await loadHostModules();
    // A-02 (ADR-0029 §4): one shared grant table for the protocol handlers
    // (directory.select / file.import.select) and the orchestration channels.
    const grants = storage.createGrantTable();
    const fileHost = storage.createFileHost({
      hostKind: "electron",
      hostVersion: app.getVersion(),
      instanceId,
      selectDirectory: scriptedSelectDirectory,
      selectFiles: scriptedSelectFiles,
      grants,
    });
    const registryValidation = contract.validateHostContract(fileHost.registry);
    if (!registryValidation.ok) {
      throw new Error(
        `invalid electron e2e host registry: ${registryValidation.issues[0]?.code}`,
      );
    }
    registerHostChannels(fileHost);
    registerE2EChannels(storage);

    watchdog = globalThis.setTimeout(() => {
      globalThis.process.stderr.write("e2e scenario watchdog timeout\n");
      app.exit(2);
    }, WATCHDOG_MS);

    const scenarioMode = recoverMode
      ? "recover"
      : (globalThis.process.env["E2E_SCENARIO_MODE"] ?? "e2e");
    const query = { mode: scenarioMode };
    if (recoverMode) {
      const marker = await recoverArtifacts(storage);
      query.docSha256 = marker.artifacts["document.json"] ?? "";
      query.expected = expectedDocSha256;
      query.removedResidue = String(marker.removedResidue);
      query.recoverySource = marker.recoverySource ?? "";
    } else if (scenarioMode === "save-loop") {
      // W3 chain 4/6: previous complete document digest for save chaining.
      query.previous = globalThis.process.env["E2E_SAVE_LOOP_PREVIOUS_SHA256"] ?? "";
    } else if (scenarioMode === "import") {
      // W3 chain 5/7: re-import a real on-disk package from the workdir.
      query.source = requiredEnv("E2E_IMPORT_SOURCE");
      query.target = requiredEnv("E2E_IMPORT_TARGET");
      query.expected = globalThis.process.env["E2E_IMPORT_EXPECTED_DOC_SHA256"] ?? "";
    } else if (scenarioMode === "project-import") {
      // A-02: real-file project import sub-scenarios; E2E_SUB picks which one.
      query.sub = globalThis.process.env["E2E_SUB"] ?? "happy";
    } else if (scenarioMode === "e2e") {
      // W3 chain 5: deterministic bulk material so import takes long enough
      // for a mid-import SIGKILL window.
      const bulkMiB = globalThis.process.env["E2E_BULK_MATERIAL_MIB"];
      if (bulkMiB !== undefined && bulkMiB !== "") {
        query.bulkMaterialMiB = bulkMiB;
      }
    } else if (scenarioMode === "workspace") {
      // A-03: mount point hands off to apps/web/dist-workspace below.
      if (globalThis.process.env["E2E_WORKSPACE_IMPORT_META"] === "1") {
        query.importMeta = "1";
      }
    }

    const window = new BrowserWindow({ show: false, webPreferences: preferences });
    window.webContents.on("console-message", (_event, _level, message) => {
      globalThis.process.stderr.write(`[renderer] ${message}\n`);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      globalThis.process.stderr.write(
        `renderer gone: ${details.reason}; aborting e2e run\n`,
      );
      finish(3);
    });
    if (scenarioMode === "workspace") {
      // A-03: the workspace UI is a PRODUCT of apps/web (IIFE bundle), loaded
      // as a file — never imported — so the L3→web layering ban stays intact.
      await window.loadFile(resolve(appDir, "../../web/dist-workspace/index.html"), {
        query,
      });
      workspaceWindowContents = window.webContents;
    } else {
      await window.loadFile(resolve(appDir, "../dist-scenario/index.html"), { query });
    }
    registerProjectChannels(ipcMain, window, { grants });
  })
  .catch((error) => {
    globalThis.process.stderr.write(`Electron e2e host failed: ${String(error)}\n`);
    app.exit(1);
  });
