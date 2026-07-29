const { contextBridge, ipcRenderer } = require("electron");

const channels = new Set(["wenshu.host.registry", "wenshu.host.invoke"]);

function invoke(channel, request) {
  if (!channels.has(channel)) throw new Error("electron host channel is not allowed");
  return ipcRenderer.invoke(channel, request);
}

contextBridge.exposeInMainWorld(
  "wenshuHost",
  Object.freeze({
    registry: () => invoke("wenshu.host.registry"),
    invoke: (request) => invoke("wenshu.host.invoke", request),
  }),
);
