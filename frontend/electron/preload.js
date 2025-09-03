(() => {
  if (globalThis.__UR_PRELOAD__) return;
  const { contextBridge, ipcRenderer } = require("electron");
  const call = (chn, payload=null) =>
    ipcRenderer.invoke(chn, payload).catch(err => ({ ok:false, error:String(err?.message||err) }));
  contextBridge.exposeInMainWorld("backend", {
    apiBase: () => call("api:base"),
    exportKmz: (opts) => call("export:kmz", opts),
    ping: () => "preload ✅",
  });
  globalThis.__UR_PRELOAD__ = true;
})();
