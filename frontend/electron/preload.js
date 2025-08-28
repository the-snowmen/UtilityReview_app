(() => {
  if (globalThis.__UR_PRELOAD__) return;
  const { contextBridge, ipcRenderer } = require("electron");

  const API_BASE = "http://127.0.0.1:5178";
  const http = async (path, method = "GET", body) => {
    const res = await fetch(API_BASE + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail || (`HTTP ${res.status}`));
    }
    return res.json();
  };

  const call = (chn, payload) =>
    ipcRenderer.invoke(chn, payload).catch(err => ({ ok:false, error:String(err?.message||err) }));

  contextBridge.exposeInMainWorld("backend", {
    // OS dialog
    selectFiles: () => call("select-files"),

    // Ingest
    ingestFile: (path, srcEpsg=null, name=null) =>
      http("/ingest", "POST", { path, srcEpsg, name }),

    // AOI
    aoiSet: (geojsonFeature) => http("/aoi/set", "POST", { geojson: geojsonFeature }),
    aoiFromKmz: (path) => http("/aoi/from-kmz", "POST", { path }),

    // Export
    exportAoiKmz: (aoi, data, suggestedName="aoi_export.kmz", opts={}) =>
      http("/export/kmz", "POST", { aoi, data, suggestedName, opts }),

    // Comments
    listComments: () => http("/comments", "GET"),
    addComment: (c) => http("/comments", "POST", c),
    updateComment: (id, c) => http(`/comments/${id}`, "PATCH", c),
    deleteComment: (id) => http(`/comments/${id}`, "DELETE"),

    // Workspace
    getWorkspace: (key="default") => http(`/workspace/${key}`,"GET"),
    setWorkspace: (key="default", json={}) => http("/workspace","PUT",{ key, json }),

    ping: async () => {
      try { const r = await http("/health","GET"); return r?.ok ? "python ✅" : "python ⚠️"; }
      catch { return "python ❌"; }
    },
  });

  globalThis.__UR_PRELOAD__ = true;
})();
