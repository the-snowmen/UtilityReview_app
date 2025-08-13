// frontend/preload.js (guarded to avoid double-injects from bundlers)
(() => {
  if (globalThis.__UR_PRELOAD__) return;

  const { contextBridge, ipcRenderer } = require("electron");

  const safeInvoke = (channel, payload) =>
    ipcRenderer.invoke(channel, payload).catch(err => ({ ok: false, error: String(err) }));

  contextBridge.exposeInMainWorld("backend", {
    // File selection & ingest
    selectFiles: () => safeInvoke("select-files"),
    ingestFile: (filePath, srcEpsg = null) => safeInvoke("ingest-file", { path: filePath, srcEpsg }),

    // Back-compat
    selectShapefiles: () => safeInvoke("select-files"),
    ingestShapefile: (p, s = null) => safeInvoke("ingest-file", { path: p, srcEpsg: s }),

    // AOI export
    exportAoiKmz: (aoi, features, suggestedName = "aoi_export.kmz") =>
      safeInvoke("export-aoi-kmz", { aoi, features, suggestedName }),

    // Diagnostics
    ping: () => "preload ✅",
  });

  globalThis.__UR_PRELOAD__ = true;
})();
