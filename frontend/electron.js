// frontend/electron.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const { ingestAny } = require("../backend/ingest/index.js");
const { kmlFileToFC, kmzFileToFC, guessLayerName } = require("../backend/ingest/kmz");

// --- DEV: auto reload (electron-reload) -------------------------------
// Enabled when the app is NOT packaged (works for `npm start` or `npm run dev`)
if (!app.isPackaged) {
  try {
    const projectRoot = path.join(__dirname, ".."); // watch the repo root
    require("electron-reload")(projectRoot, {
      // fully restart Electron when main-process files change
      hardResetMethod: "exit",
      awaitWriteFinish: true,
      // ignore heavy & noisy folders/files
      ignored: /(^|[/\\])\..|node_modules|dist|out|build|\.git|\.cache/,
    });
    console.log("[dev] electron-reload active →", projectRoot);
  } catch (e) {
    console.warn("[dev] electron-reload not active:", e?.message || e);
  }
}
// ---------------------------------------------------------------------

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "UR Platform",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false, // keep false if using Node APIs in preload safely
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "index.html"));

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // // Auto-open DevTools in dev (not in packaged builds)
  // if (!app.isPackaged) {
  //   win.webContents.once("dom-ready", () => {
  //     try { win.webContents.openDevTools({ mode: "detach" }); } catch {}
  //   });
  // }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---------- IPC: File selection ----------
ipcMain.handle("select-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Select GIS File(s)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "GIS", extensions: ["shp", "zip", "kml", "kmz", "geojson", "json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return { ok: true, paths: canceled ? [] : filePaths };
});

// ---------- IPC: Ingest ----------
ipcMain.handle("ingest-file", async (_evt, { path: filePath, srcEpsg = null } = {}) => {
  try {
    if (!filePath) throw new Error("Missing file path");
    const result = await ingestAny(filePath, srcEpsg);
    return { ok: true, ...result };
  } catch (e) {
    console.error("[ingest-file]", e);
    return { ok: false, error: String(e?.message || e) };
  }
});

// Back-compat alias
ipcMain.handle("ingest-shapefile", async (evt, payload) =>
  ipcMain.invoke("ingest-file", payload)
);

// ---------- IPC: Export AOI -> KMZ ----------
ipcMain.handle("export-aoi-kmz", async (_evt, payload = {}) => {
  try {
    const {
      aoi,
      data,                 // preferred (array of {name, style, features} OR a FC)
      features,             // back-compat (single FeatureCollection)
      suggestedName = "aoi_export.kmz",
      opts = {},
    } = payload;

    if (!aoi) throw new Error("Missing AOI polygon");

    const exportData = data ?? features;
    if (!exportData) throw new Error("No features to export");

    // Validate whether we got an array-of-layers or a single FC
    let hasContent = false;
    if (Array.isArray(exportData)) {
      hasContent = exportData.some(
        l => l?.features?.type === "FeatureCollection" && l.features.features?.length
      );
    } else {
      hasContent = exportData?.type === "FeatureCollection" && exportData.features?.length;
    }
    if (!hasContent) throw new Error("No visible features to export");

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save AOI Export (KMZ)",
      defaultPath: suggestedName.endsWith(".kmz") ? suggestedName : `${suggestedName}.kmz`,
      filters: [{ name: "KMZ", extensions: ["kmz"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const { exportClippedKmz } = require("../backend/export/clipToKmz.js");
    await exportClippedKmz(aoi, exportData, filePath, {
      includeAoi: true,
      keepAttributes: !!opts.keepAttributes,
      kmlName: "AOI Export",
    });

    return { ok: true, path: filePath };
  } catch (e) {
    console.error("[export-aoi-kmz]", e);
    return { ok: false, error: String(e?.message || e) };
  }
});

// AOI from KML/KMZ: open dialog, parse, return AOI feature
ipcMain.handle("aoi:pick-kmx", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "KML/KMZ", extensions: ["kml", "kmz"] }],
  });
  if (canceled || !filePaths?.[0]) return { canceled: true };

  try {
    const feature = await fileToAoiFeature(filePaths[0]);
    return { ok: true, feature };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});
