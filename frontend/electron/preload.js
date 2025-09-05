(() => {
  if (globalThis.__UR_PRELOAD__) return;
  const { contextBridge, ipcRenderer } = require("electron");

  const call = (chn, payload) =>
    ipcRenderer.invoke(chn, payload).catch(err => ({ ok:false, error:String(err?.message||err) }));

  contextBridge.exposeInMainWorld("backend", {
    // keep your other bridges (selectFiles, ingestFile, etc.)

    // NEW: canonical bridge for KMZ export -> matches main.js "export:kmz"
    exportKmz: ({ name = "aoi_export", kml = null, legendPngBase64 = null } = {}) =>
      call("export:kmz", { name, kml, legendPngBase64 }),


    // (optional) backward-compat aliases if old UI calls them:
    exportAoiKmz: (args) => call("export:kmz", args),
    ping: () => "preload ✅",
  });

  globalThis.__UR_PRELOAD__ = true;
})();
