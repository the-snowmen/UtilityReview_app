// frontend/electron.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const { ingestAny } = require("../backend/ingest/index.js");

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "UR App – GIS Viewer",
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

  // Block window.open and open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
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
ipcMain.handle("ingest-shapefile", async (evt, payload) => ipcMain.invoke("ingest-file", payload));

// ---------- IPC: Export AOI -> KMZ ----------
ipcMain.handle("export-aoi-kmz", async (_evt, { aoi, features, suggestedName } = {}) => {
  try {
    if (!aoi) throw new Error("Missing AOI polygon");
    if (!features || !Array.isArray(features.features) || features.features.length === 0) {
      throw new Error("No features to export");
    }

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save AOI Export (KMZ)",
      defaultPath: suggestedName || "aoi_export.kmz",
      filters: [{ name: "KMZ", extensions: ["kmz"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const { exportClippedKmz } = require("../backend/export/clipToKmz.js");
    await exportClippedKmz(aoi, features, filePath);

    return { ok: true, path: filePath };
  } catch (e) {
    console.error("[export-aoi-kmz]", e);
    return { ok: false, error: String(e?.message || e) };
  }
});
