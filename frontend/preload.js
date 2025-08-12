const { contextBridge, ipcRenderer } = require("electron");

function safeInvoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).catch(err => {
    console.error(`[IPC:${channel}]`, err);
    return { ok: false, error: String(err) };
  });
}

contextBridge.exposeInMainWorld("backend", {
  selectShapefiles: () => safeInvoke("select-shapefiles"),
  ingestShapefile: (shpPath, srcEpsg = null) =>
    safeInvoke("ingest-shapefile", { path: shpPath, srcEpsg }),
  ping: () => "renderer can see preload ✅"
});
