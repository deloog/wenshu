const { contextBridge, ipcRenderer } = require("electron");

// Sandboxed preloads get a restricted `process` global (not attached to
// globalThis); the main process flags e2e mode via additionalArguments.
const e2eMode =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.includes("--wenshu-e2e");

const channels = new Set([
  "wenshu.host.registry",
  "wenshu.host.invoke",
  "wenshu.host.cancel",
  "wenshu.project.new",
  "wenshu.project.open",
  "wenshu.project.import",
  "wenshu.project.import.cancel",
  "wenshu.project.document.read",
  ...(e2eMode ? ["e2e.knowledge.export", "e2e.knowledge.import", "e2e.report"] : []),
]);

function invoke(channel, request) {
  if (!channels.has(channel)) throw new Error("electron host channel is not allowed");
  return ipcRenderer.invoke(channel, request);
}

contextBridge.exposeInMainWorld(
  "wenshuHost",
  Object.freeze({
    registry: () => invoke("wenshu.host.registry"),
    invoke: (request) => invoke("wenshu.host.invoke", request),
    cancel: (request) => invoke("wenshu.host.cancel", request),
  }),
);

const PROGRESS_CHANNEL = "wenshu.project.import.progress";
let progressListener;

function onImportProgress(callback) {
  offImportProgress();
  progressListener = (_event, payload) => callback(payload);
  ipcRenderer.on(PROGRESS_CHANNEL, progressListener);
}

function offImportProgress() {
  if (progressListener !== undefined) {
    ipcRenderer.removeListener(PROGRESS_CHANNEL, progressListener);
    progressListener = undefined;
  }
}

// A-02 orchestration surface (ADR-0029 §4): grant ids, flat names and display
// metadata only; payloads are forwarded verbatim to the whitelisted channels.
contextBridge.exposeInMainWorld(
  "wenshuProject",
  Object.freeze({
    newProject: (input) => invoke("wenshu.project.new", input),
    openProject: (input) => invoke("wenshu.project.open", input),
    importProject: (input) => invoke("wenshu.project.import", input),
    cancelImport: (input) => invoke("wenshu.project.import.cancel", input),
    readDocument: (input) => invoke("wenshu.project.document.read", input),
    onImportProgress,
    offImportProgress,
  }),
);

if (e2eMode) {
  contextBridge.exposeInMainWorld(
    "wenshuE2E",
    Object.freeze({
      export: (input) => invoke("e2e.knowledge.export", input),
      import: (input) => invoke("e2e.knowledge.import", input),
      report: (payload) => invoke("e2e.report", payload),
    }),
  );
}
