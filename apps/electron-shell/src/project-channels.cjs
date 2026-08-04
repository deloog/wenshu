/**
 * A-02 orchestration channels (ADR-0029 §4), shared by main.cjs (product
 * shell) and e2e-main.cjs (scripted shell):
 *   wenshu.project.new / wenshu.project.open /
 *   wenshu.project.import / wenshu.project.import.cancel
 * plus the progress event stream "wenshu.project.import.progress".
 *
 * Every payload in either direction carries only grant ids, flat directory
 * names and display metadata — no system path ever crosses IPC. Failures come
 * back as { status: "error", code } where code is a FileBoundaryError code or
 * a stable local code; messages never embed a path. The shell stays a thin
 * adapter (dialog + GrantTable injection + error-code mapping); all project
 * logic lives in L2 (@wenshu/project-storage, @wenshu/markdown-import).
 */
const { createHash, randomUUID } = require("node:crypto");
const { mkdir, readFile, stat } = require("node:fs/promises");
const { join } = require("node:path");

/**
 * Flat directory names only: same shape as project-storage SAFE_FILE_NAME
 * (no separators, no traversal, no trailing dot, no Windows reserved names).
 */
const FLAT_NAME =
  /^(?!.*\.$)(?!CON$|PRN$|AUX$|NUL$|COM[1-9]$|LPT[1-9]$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/iu;

const PROGRESS_CHANNEL = "wenshu.project.import.progress";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorResult(code, extra) {
  return { status: "error", code, ...extra };
}

/**
 * @param ipcMain Electron ipcMain (handle registration target).
 * @param window BrowserWindow whose webContents receives progress events.
 * @param context { grants: GrantTable, selectFilesImpl?: fn } — the grant
 *   table MUST be the same instance handed to createFileHost({ grants }) so
 *   protocol-registered grants (directory.select, file.import.select) and
 *   these channels share one table.
 */
function registerProjectChannels(ipcMain, window, context) {
  const grants = context.grants;
  /** import_id -> AbortController for wenshu.project.import.cancel. */
  const runningImports = new Map();

  ipcMain.handle("wenshu.project.new", async (_event, input) => {
    const grant = grants.resolve(input?.grant_id);
    if (grant === undefined) {
      return errorResult("NOT_FOUND");
    }
    if (grant.mode !== "read_write") {
      return errorResult("PERMISSION_DENIED");
    }
    const dirName = input?.dir_name;
    if (typeof dirName !== "string" || !FLAT_NAME.test(dirName)) {
      return errorResult("INVALID");
    }
    const target = join(grant.root, dirName);
    const existing = await stat(target).catch(() => undefined);
    // D2: the target must not exist beforehand; refuse, never merge.
    if (existing !== undefined) {
      return { status: "exists" };
    }
    // ADR-0029 §3 empty-project convention: create the directory only, no
    // document.json (v0.1.0 requires blocks >= 1; an empty block is faked).
    await mkdir(target);
    return { status: "created", dir_name: dirName };
  });

  ipcMain.handle("wenshu.project.open", async (_event, input) => {
    const grant = grants.resolve(input?.grant_id);
    if (grant === undefined) {
      return errorResult("NOT_FOUND");
    }
    const rootStat = await stat(grant.root).catch(() => undefined);
    if (rootStat === undefined || !rootStat.isDirectory()) {
      return errorResult("NOT_FOUND");
    }
    let raw;
    try {
      raw = await readFile(join(grant.root, "document.json"));
    } catch (error) {
      // Missing document.json is a legal empty project, not a failure.
      if (typeof error === "object" && error !== null && error.code === "ENOENT") {
        return { status: "opened", has_document: false };
      }
      return errorResult("IO_FAILURE");
    }
    let document;
    try {
      document = JSON.parse(raw.toString("utf8"));
    } catch {
      // Corrupt document.json fails explicitly; never silently rebuilt.
      return { status: "corrupt" };
    }
    const result = {
      status: "opened",
      has_document: true,
      document_sha256: sha256(raw),
    };
    if (typeof document?.title === "string") {
      result.title = document.title;
    }
    return result;
  });

  ipcMain.handle("wenshu.project.import", async (_event, input) => {
    const { FileBoundaryError } = await import("@wenshu/project-storage");
    const { importMarkdownProject } = await import("@wenshu/markdown-import");
    const importId = randomUUID();
    const controller = new globalThis.AbortController();
    runningImports.set(importId, controller);
    try {
      const result = await importMarkdownProject({
        grants,
        projectGrantId: input?.project_grant_id,
        targetDirName: input?.target_dir_name,
        sourceGrantId: input?.source_grant_id,
        ...(input?.asset_grant_ids === undefined
          ? {}
          : { assetGrantIds: input.asset_grant_ids }),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!window.isDestroyed()) {
            window.webContents.send(PROGRESS_CHANNEL, {
              import_id: importId,
              ...progress,
            });
          }
        },
      });
      return { import_id: importId, ...result };
    } catch (error) {
      if (error instanceof FileBoundaryError) {
        return errorResult(error.code, { import_id: importId });
      }
      throw error;
    } finally {
      runningImports.delete(importId);
    }
  });

  ipcMain.handle("wenshu.project.import.cancel", (_event, input) => {
    const controller = runningImports.get(input?.import_id);
    if (controller === undefined) {
      return errorResult("NOT_FOUND");
    }
    controller.abort();
    return { status: "cancel_requested" };
  });
}

module.exports = { registerProjectChannels };
