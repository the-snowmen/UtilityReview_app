// frontend/preload.js
(() => {
  if (globalThis.__UR_PRELOAD__) return;
  const { contextBridge, ipcRenderer } = require("electron");

  const call = (chn, payload) =>
    ipcRenderer.invoke(chn, payload).catch(err => ({ ok:false, error:String(err?.message||err) }));

  contextBridge.exposeInMainWorld("backend", {
    selectFiles: () => call("select-files"),
    ingestFile:  (path, srcEpsg=null) => call("ingest-file", { path, srcEpsg }),

    // AOI helpers
    aoiPickKmx: () => call("aoi:pick-kmx"),

    // Export
    exportAoiKmz: (aoi, data, suggestedName="aoi_export.kmz", opts={}) =>
      call("export-aoi-kmz", { aoi, data, suggestedName, opts }),

    ping: () => "preload ✅",
  });

  globalThis.__UR_PRELOAD__ = true;
})();
