// frontend/electron.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { ingestAny } = require("../backend/ingest/index.js");

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "UR App – GIS Viewer",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
    show: true,
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---- IPC
ipcMain.handle("select-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Select GIS File(s)",
    filters: [{ name: "GIS", extensions: ["shp", "zip", "kml", "kmz", "geojson", "json"] }],
    properties: ["openFile", "multiSelections"],
  });
  return { ok: true, paths: canceled ? [] : filePaths };
});

ipcMain.handle("ingest-file", async (_evt, { path: filePath, srcEpsg }) => {
  try {
    const r = await ingestAny(filePath, srcEpsg || null);
    return { ok: true, ...r };
  } catch (e) {
    console.error("[ingest-file]", e);
    return { ok: false, error: String(e) };
  }
});

// Back-compat alias
ipcMain.handle("ingest-shapefile", async (_evt, { path: filePath, srcEpsg }) => {
  try {
    const r = await ingestAny(filePath, srcEpsg || null);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
