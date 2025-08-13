// frontend/preload.js (guarded to avoid double-inject)
(() => {
  if (globalThis.__UR_PRELOAD__) return;
  const { contextBridge, ipcRenderer } = require("electron");

  function safeInvoke(channel, payload) {
    return ipcRenderer.invoke(channel, payload).catch(err => ({ ok: false, error: String(err) }));
  }

  contextBridge.exposeInMainWorld("backend", {
    selectFiles: () => safeInvoke("select-files"),
    ingestFile: (filePath, srcEpsg = null) => safeInvoke("ingest-file", { path: filePath, srcEpsg }),
    // legacy
    selectShapefiles: () => safeInvoke("select-files"),
    ingestShapefile: (p, s = null) => safeInvoke("ingest-file", { path: p, srcEpsg: s }),
    ping: () => "preload ✅",
  });

  globalThis.__UR_PRELOAD__ = true;
})();
