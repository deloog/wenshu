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
